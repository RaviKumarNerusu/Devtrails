const Payout = require("../models/Payout");
const Policy = require("../models/Policy");
const PartnerProfile = require("../models/PartnerProfile");
const { fetchCurrentWeather } = require("./openWeatherService");
const { calculateRisk, calculatePayout } = require("./payoutService");
const { getLocalDateOnly } = require("../utils/claimValidator");
const { extractRainSafely } = require("../utils/claimValidator");

function normalizeNonNegativeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

async function getOrCreateProfile(userId) {
  let profile = await PartnerProfile.findOne({ userId });
  if (!profile) {
    profile = await PartnerProfile.create({ userId, city: "Bangalore", rainThresholdMm: 15 });
  }
  return profile;
}

async function buildTodayCompensation(user) {
  const profile = await getOrCreateProfile(user._id);

  const targetCity = profile.city || "Bangalore";
  const currentWeather = await fetchCurrentWeather(targetCity);

  const rainMm = extractRainSafely(currentWeather, 1);
  const rainThresholdMm = normalizeNonNegativeNumber(profile.rainThresholdMm);
  const avgDailyEarning = normalizeNonNegativeNumber(profile.avgDailyEarning);

  const riskLevel = calculateRisk(rainMm, rainThresholdMm);

  const activePolicy = await Policy.findOne({ userId: user._id, isActive: true }).sort({ createdAt: -1 }).lean();
  const hasPolicy = Boolean(activePolicy);
  const predictedLoss = calculatePayout(rainMm, rainThresholdMm, avgDailyEarning);

  if (!hasPolicy) {
    return {
      hasPolicy: false,
      rainMm,
      threshold: rainThresholdMm,
      predictedLoss,
      showTakePolicy: true,
      city: targetCity,
      riskLevel,
      rainThresholdMm,
      avgDailyEarning,
      payoutAmount: 0,
      triggered: false,
      status: "not_eligible"
    };
  }

  const payoutAmount = calculatePayout(rainMm, rainThresholdMm, avgDailyEarning);

  return {
    hasPolicy: true,
    showTakePolicy: false,
    city: targetCity,
    rainMm,
    riskLevel,
    rainThresholdMm,
    threshold: rainThresholdMm,
    avgDailyEarning,
    predictedLoss,
    payoutAmount,
    triggered: payoutAmount > 0,
    status: payoutAmount > 0 ? "approved" : "not triggered"
  };
}

async function createOrUpdateTodayPayout(user, todayComp) {
  if (!todayComp) return null;

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const payout = await Payout.findOneAndUpdate(
    { userId: user._id, date: dayStart },
    {
      $set: {
        city: todayComp.city,
        rainMm: todayComp.rainMm,
        threshold: todayComp.rainThresholdMm,
        avgEarning: todayComp.avgDailyEarning,
        riskLevel: todayComp.riskLevel,
        payoutAmount: todayComp.payoutAmount,
        status: todayComp.payoutAmount > 0 ? "approved" : "not triggered",
        reason:
          todayComp.payoutAmount > 0
            ? "Rain disrupted workday (insurance payout triggered)"
            : "No payout triggered (rain below protection level or no active plan)"
      }
    },
    { new: true, upsert: true }
  );

  return payout;
}

async function listRecentPayouts(userId, days, city) {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const query = {
    userId,
    date: { $gte: from }
  };

  if (city) query.city = city;

  const items = await Payout.find(query)
    .sort({ date: 1 })
    .lean();

  // Drop legacy/invalid docs by validating payout/risk against the current parametric model.
  return items.filter((p) => {
    const threshold = Number.isFinite(Number(p.threshold)) ? Number(p.threshold) : 0;
    const avg = Number.isFinite(Number(p.avgEarning)) ? Number(p.avgEarning) : 0;
    const rain = Number.isFinite(Number(p.rainMm)) ? Number(p.rainMm) : 0;

    if (!(rain >= 0) || !(threshold >= 0) || !(avg >= 0)) return false;

    const expectedRisk = calculateRisk(rain, threshold);
    const payoutAmount = Number(p.payoutAmount) || 0;
    const status = p.status || "not triggered";

    // If payout is non-zero, it must match the parametric model (plan must have been active at calculation time).
    if (payoutAmount > 0) {
      if (status !== "approved") return false;
      if (p.riskLevel !== expectedRisk) return false;
      const expectedPayout = avg > 0 ? calculatePayout(rain, threshold, avg) : 0;
      if (expectedPayout <= 0) return false;
      return Math.abs(payoutAmount - expectedPayout) < 0.0001;
    }

    // If payout is zero, keep the record (plan might have been inactive). Only validate that it is truly zero.
    if (payoutAmount !== 0) return false;
    if (status !== "not triggered") return false;

    // Risk should be consistent, but allow UNKNOWN for legacy docs.
    if (p.riskLevel && p.riskLevel !== "UNKNOWN" && p.riskLevel !== expectedRisk) return false;
    return true;
  });
}

module.exports = {
  buildTodayCompensation,
  createOrUpdateTodayPayout,
  listRecentPayouts
};


