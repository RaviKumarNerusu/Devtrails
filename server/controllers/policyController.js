const Policy = require("../models/Policy");
const User = require("../models/User");
const PartnerProfile = require("../models/PartnerProfile");
const { calculatePremium } = require("../services/premiumService");
const { runAutomationTriggers } = require("../services/triggerService");
const { fetchCurrentWeather } = require("../services/openWeatherService");
const { runAutomationForUser } = require("../services/automationService");
const { calculatePremium: calculateWeeklyPremium } = require("../utils/premiumCalculator");

function rainFromCurrent(data) {
  return Number(data?.rain?.["1h"] || data?.rain?.["3h"] || 0) || 0;
}

function temperatureFromCurrent(data) {
  return Number(data?.main?.temp ?? data?.temp ?? 0) || 0;
}

function aqiFromCurrent(data) {
  return Number(data?.main?.aqi ?? data?.aqi ?? 0) || 0;
}

async function createPolicy(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401);
      throw new Error("Not authorized");
    }

    const { coverageHours, location, isActive } = req.body || {};
    const profile = await PartnerProfile.findOne({ userId }).lean();
    const city = location || profile?.city || "Bangalore";
    const threshold = Number(profile?.rainThresholdMm || 15);
    const user = await User.findById(userId).lean();
    const current = await fetchCurrentWeather(city);
    const weather = {
      rainMm: rainFromCurrent(current),
      temperature: temperatureFromCurrent(current),
      aqi: aqiFromCurrent(current),
      threshold,
      heatThreshold: Number(process.env.TRIGGER_HEAT_THRESHOLD || 35)
    };

    const triggerResult = runAutomationTriggers({ weather, user, location: city });
    const premiumBase = calculatePremium(user, weather, { location: city });
    const dynamicPremium = Math.max(20, premiumBase.premium + triggerResult.premiumDelta);
    const weeklyPremium = calculateWeeklyPremium(user?.risk_score ?? user?.riskScore ?? 0);

    const policy = await Policy.findOneAndUpdate(
      { userId },
      {
        $set: {
          basePremium: premiumBase.basePremium,
          dynamicPremium,
          weekly_premium: weeklyPremium,
          riskLevel: dynamicPremium >= 140 ? "high" : dynamicPremium >= 115 ? "medium" : "low",
          coverageHours: Number(coverageHours) || 24,
          location: city,
          isActive: typeof isActive === "boolean" ? isActive : true,
          lastUpdated: new Date()
        },
        $setOnInsert: { userId }
      },
      { new: true, upsert: true }
    );

    res.status(201).json({ policy });
  } catch (err) {
    next(err);
  }
}

async function getPolicyByUser(req, res, next) {
  try {
    const userIdParam = String(req.params.userId || "");
    const requester = String(req.user?._id || "");
    if (!requester || requester !== userIdParam) {
      res.status(403);
      throw new Error("Forbidden");
    }
    const policy = await Policy.findOne({ userId: userIdParam, isActive: true }).sort({ createdAt: -1 }).lean();
    res.json({ policy });
  } catch (err) {
    next(err);
  }
}

async function calculatePremiumEndpoint(req, res, next) {
  try {
    const user = await User.findById(req.user._id).lean();
    const profile = await PartnerProfile.findOne({ userId: req.user._id }).lean();
    const city = String(req.body?.location || profile?.city || "Bangalore");
    const threshold = Number(req.body?.threshold || profile?.rainThresholdMm || 15);
    const current = await fetchCurrentWeather(city);
    const weather = {
      rainMm: rainFromCurrent(current),
      temperature: temperatureFromCurrent(current),
      aqi: aqiFromCurrent(current),
      threshold,
      heatThreshold: Number(process.env.TRIGGER_HEAT_THRESHOLD || 35)
    };

    const triggerResult = runAutomationTriggers({ weather, user, location: city });
    const base = calculatePremium(user, weather, { location: city });
    const dynamicPremium = Math.max(20, base.premium + triggerResult.premiumDelta);
    const weeklyPremium = calculateWeeklyPremium(user?.risk_score ?? user?.riskScore ?? 0);

    res.json({
      premium: dynamicPremium,
      weeklyPremium,
      riskLevel: dynamicPremium >= 140 ? "high" : dynamicPremium >= 115 ? "medium" : "low",
      breakdown: base.breakdown,
      weather,
      triggers: triggerResult.triggers
    });
  } catch (err) {
    next(err);
  }
}

async function runTriggerEndpoint(req, res, next) {
  try {
    const payload = await runAutomationForUser(req.user);
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

async function getTriggerStatus(req, res, next) {
  try {
    const user = await User.findById(req.user._id).lean();
    const profile = await PartnerProfile.findOne({ userId: req.user._id }).lean();
    const city = profile?.city || user?.location || "Bangalore";
    const threshold = Number(profile?.rainThresholdMm || 15);
    const current = await fetchCurrentWeather(city);
    const weather = {
      rainMm: rainFromCurrent(current),
      temperature: temperatureFromCurrent(current),
      aqi: aqiFromCurrent(current),
      threshold,
      heatThreshold: Number(process.env.TRIGGER_HEAT_THRESHOLD || 35),
      condition: current?.weather?.[0]?.main || "Unknown"
    };

    const triggerResult = runAutomationTriggers({
      weather,
      user,
      location: city,
      activityDrop: false
    });

    res.json({
      city,
      weather,
      triggers: triggerResult.triggers,
      shouldCreateClaim: triggerResult.shouldCreateClaim
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPolicy,
  getPolicyByUser,
  calculatePremiumEndpoint,
  runTriggerEndpoint,
  getTriggerStatus
};

