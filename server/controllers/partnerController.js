const PartnerProfile = require("../models/PartnerProfile");
const Policy = require("../models/Policy");
const User = require("../models/User");

const FACTOR_OPTIONS = ["rain", "heat", "pollution", "flood", "social"];
const DEFAULT_THRESHOLDS = {
  rain: 15,
  heat: 38,
  aqi: 150,
  flood: 30,
  social: true
};
const DEFAULT_ENABLED_FACTORS = {
  rain: true,
  heat: true,
  aqi: true,
  flood: true,
  social: true
};

function normalizeEnabledFactors(input) {
  if (!Array.isArray(input)) return FACTOR_OPTIONS;
  const deduped = [...new Set(input.map((item) => String(item || "").trim().toLowerCase()))]
    .filter((item) => FACTOR_OPTIONS.includes(item));
  return deduped.length > 0 ? deduped : FACTOR_OPTIONS;
}

function normalizeThresholds(input = {}) {
  const thresholds = input && typeof input === "object" ? input : {};
  return {
    rain: Number.isFinite(Number(thresholds.rain)) ? Number(thresholds.rain) : DEFAULT_THRESHOLDS.rain,
    heat: Number.isFinite(Number(thresholds.heat)) ? Number(thresholds.heat) : DEFAULT_THRESHOLDS.heat,
    aqi: Number.isFinite(Number(thresholds.aqi)) ? Number(thresholds.aqi) : DEFAULT_THRESHOLDS.aqi,
    flood: Number.isFinite(Number(thresholds.flood)) ? Number(thresholds.flood) : DEFAULT_THRESHOLDS.flood,
    social: typeof thresholds.social === "boolean" ? thresholds.social : DEFAULT_THRESHOLDS.social
  };
}

function normalizeEnabledFactorMap(input = {}, enabledFactorsArray = null) {
  const flags = input && typeof input === "object" ? input : {};
  const normalized = {
    rain: typeof flags.rain === "boolean" ? flags.rain : DEFAULT_ENABLED_FACTORS.rain,
    heat: typeof flags.heat === "boolean" ? flags.heat : DEFAULT_ENABLED_FACTORS.heat,
    aqi: typeof flags.aqi === "boolean" ? flags.aqi : DEFAULT_ENABLED_FACTORS.aqi,
    flood: typeof flags.flood === "boolean" ? flags.flood : DEFAULT_ENABLED_FACTORS.flood,
    social: typeof flags.social === "boolean" ? flags.social : DEFAULT_ENABLED_FACTORS.social
  };

  if (Array.isArray(enabledFactorsArray)) {
    const selected = normalizeEnabledFactors(enabledFactorsArray);
    return {
      rain: selected.includes("rain"),
      heat: selected.includes("heat"),
      aqi: selected.includes("pollution"),
      flood: selected.includes("flood"),
      social: selected.includes("social")
    };
  }

  return normalized;
}

function enabledMapToArray(enabledFactors = DEFAULT_ENABLED_FACTORS) {
  const map = enabledFactors && typeof enabledFactors === "object" ? enabledFactors : DEFAULT_ENABLED_FACTORS;
  return [
    map.rain ? "rain" : null,
    map.heat ? "heat" : null,
    map.aqi ? "pollution" : null,
    map.flood ? "flood" : null,
    map.social ? "social" : null
  ].filter(Boolean);
}

async function getProfile(req, res, next) {
  try {
    const [profile, userRecord] = await Promise.all([
      PartnerProfile.findOne({ userId: req.user._id }).lean(),
      User.findById(req.user._id).select("thresholds enabled_factors").lean()
    ]);

    if (!profile) {
      return res.json({ profile: null });
    }

    const thresholds = normalizeThresholds(userRecord?.thresholds || {});
    const enabled_factors = normalizeEnabledFactorMap(userRecord?.enabled_factors || {}, profile?.enabledFactors || null);

    res.json({
      profile: {
        ...profile,
        thresholds,
        enabled_factors,
        enabledFactors: enabledMapToArray(enabled_factors)
      }
    });
  } catch (err) {
    next(err);
  }
}

async function saveProfile(req, res, next) {
  try {
    const { city, pincode, avgDailyEarning, rainThresholdMm, enabledFactors, thresholds, enabled_factors } = req.body || {};

    const normalizedThresholds = normalizeThresholds({
      ...(thresholds || {}),
      rain: Number.isFinite(Number(rainThresholdMm)) ? Number(rainThresholdMm) : undefined
    });
    const enabledFactorMap = normalizeEnabledFactorMap(enabled_factors || {}, enabledFactors);
    const enabledFactorsArray = enabledMapToArray(enabledFactorMap);

    const update = {
      city: city || "",
      pincode: pincode || "",
      avgDailyEarning: Number(avgDailyEarning) || 0,
      rainThresholdMm: normalizedThresholds.rain,
      enabledFactors: enabledFactorsArray
    };

    const profile = await PartnerProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: update, $setOnInsert: { userId: req.user._id } },
      { upsert: true, new: true }
    );

    if (String(update.city || "").trim()) {
      await Policy.findOneAndUpdate(
        { userId: req.user._id, isActive: true },
        { $set: { location: String(update.city).trim(), lastUpdated: new Date() } }
      );
    }

    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        thresholds: normalizedThresholds,
        enabled_factors: enabledFactorMap
      }
    });

    res.json({
      profile: {
        ...profile.toObject(),
        thresholds: normalizedThresholds,
        enabled_factors: enabledFactorMap,
        enabledFactors: enabledFactorsArray
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, saveProfile };

