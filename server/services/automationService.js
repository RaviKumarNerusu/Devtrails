const User = require("../models/User");
const Policy = require("../models/Policy");
const PartnerProfile = require("../models/PartnerProfile");
const { fetchCurrentWeather } = require("./openWeatherService");
const { calculatePremium } = require("./premiumService");
const { runAutomationTriggers } = require("./triggerService");
const { buildTodayCompensation } = require("./compensationService");
const { upsertDailyClaimRecord } = require("./claimService");
const {
  validateUserProfile,
  validateWeatherData,
  extractRainSafely,
  getLocalDateOnly,
  validateDailyClaimLimit,
  validateCityLock
} = require("../utils/claimValidator");
const logger = require("../utils/logger");

/**
 * Configuration for claim automation
 */
const CLAIM_CONFIG = {
  MAX_CLAIMS_PER_DAY: 1,
  MAX_CLAIMS_PER_WEEK: 7,
  MAX_PAYOUT_AMOUNT: 50000, // Premium capping
  RAINFALL_FALLBACK: 1 // If rain condition exists but value missing
};

function formatLocalDateKey(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getActivePolicyOrThrow(user, profile, session = null) {
  const policy = await Policy.findOne({ userId: user._id, isActive: true }).sort({ createdAt: -1 }).session(session);
  if (!policy) {
    const err = new Error("No active policy. Select a plan first.");
    err.statusCode = 400;
    err.errorCode = "NO_ACTIVE_POLICY";
    throw err;
  }

  const nextLocation = profile?.city || profile?.pincode || "";
  if (nextLocation && policy.location !== nextLocation) {
    policy.location = nextLocation;
    policy.lastUpdated = new Date();
    await policy.save({ session });
  }

  return policy;
}

/**
 * Get or create partner profile (no fallback to Bangalore)
 */
async function getOrCreatePartnerProfile(user) {
  let profile = await PartnerProfile.findOne({ userId: user._id }).lean();

  if (!profile) {
    const err = new Error("Partner profile incomplete");
    err.statusCode = 400;
    err.errorCode = "PARTNER_PROFILE_INCOMPLETE";
    throw err;
  }

  return profile;
}

/**
 * Calculate dynamic payout tiers based on rainfall
 */
function calculateDynamicPayout(rainMm, threshold, baseAmount) {
  if (!baseAmount || baseAmount <= 0) return 0;

  // Only payout if rain is strictly above the threshold.
  if (rainMm <= threshold) {
    return 0;
  }

  // Tiered payout system
  const rainRatio = rainMm / threshold;

  if (rainRatio >= 3) {
    return baseAmount * 1.0; // Full payout (high tier)
  } else if (rainRatio >= 2) {
    return baseAmount * 0.6; // Medium payout (medium tier)
  } else if (rainRatio >= 1) {
    return baseAmount * 0.3; // Base payout (low tier)
  }

  return 0;
}

function calculateTriggeredPayout({
  triggerType,
  triggerTypes = [],
  rainMm,
  rainThreshold,
  floodThreshold,
  temperature,
  heatThreshold,
  aqi,
  pollutionThreshold,
  socialEvent,
  baseAmount
}) {
  if (!baseAmount || baseAmount <= 0) return 0;

  const activeTriggers = Array.isArray(triggerTypes) && triggerTypes.length > 0
    ? [...new Set(triggerTypes)]
    : [triggerType];

  const severityWeights = {
    rain: 0.4,
    heat: 0.3,
    pollution: 0.2,
    flood: 0.6,
    social: 0.5
  };

  const combinedRatio = Math.min(
    1,
    activeTriggers.reduce((sum, item) => sum + (severityWeights[item] || 0), 0)
  );

  if (combinedRatio > 0 && activeTriggers.length > 1) {
    return baseAmount * combinedRatio;
  }

  switch (triggerType) {
    case "heat":
      return temperature >= heatThreshold ? baseAmount * severityWeights.heat : 0;
    case "pollution":
      return aqi > pollutionThreshold ? baseAmount * severityWeights.pollution : 0;
    case "flood":
      return calculateDynamicPayout(rainMm, floodThreshold, baseAmount);
    case "social":
      return socialEvent?.active ? baseAmount * severityWeights.social : 0;
    case "rain":
    default:
      return calculateDynamicPayout(rainMm, rainThreshold, baseAmount);
  }
}

/**
 * Check weekly claim limit
 */
function checkWeeklyClaimLimit(user, maxClaimsPerWeek = CLAIM_CONFIG.MAX_CLAIMS_PER_WEEK) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday start

  const weekStartKey = formatLocalDateKey(weekStart);
  const userWeekStart = user.weekStartDate ? formatLocalDateKey(getLocalDateOnly(new Date(user.weekStartDate))) : null;

  // If week changed, reset counter
  if (userWeekStart !== weekStartKey) {
    logger.debug("Weekly claim counter reset", {
      userId: user._id.toString(),
      previousWeek: userWeekStart,
      currentWeek: weekStartKey
    });
    return { count: 0, limit: maxClaimsPerWeek, canClaim: true };
  }

  const weeklyCount = user.weeklyClaimCount || 0;
  const canClaim = weeklyCount < maxClaimsPerWeek;

  if (!canClaim) {
    logger.fraudCheck(user._id, "WEEKLY_LIMIT_EXCEEDED", true, 
      `User has ${weeklyCount} claims this week (limit: ${maxClaimsPerWeek})`);
  }

  return { count: weeklyCount, limit: maxClaimsPerWeek, canClaim };
}

/**
 * Main automation function with full validation and fraud prevention
 */
async function runAutomationForUser(user) {
  // ========== STEP 1: VALIDATION ==========
  logger.info("Starting automation for user", { userId: user._id.toString() });

  // Validate user has profile and city
  const profile = await getOrCreatePartnerProfile(user);
  const city = validateUserProfile(user, profile);

  // Validate threshold and rainfall
  const threshold = Number(profile.rainThresholdMm || 15);
  if (threshold <= 0) {
    const err = new Error("Invalid rain threshold: expected positive number");
    err.statusCode = 400;
    err.errorCode = "INVALID_THRESHOLD";
    logger.error("Invalid threshold", { userId: user._id.toString(), threshold });
    throw err;
  }

  // ========== STEP 2: FETCH & VALIDATE WEATHER ==========
  let currentWeather;
  try {
    currentWeather = await fetchCurrentWeather(city);
  } catch (err) {
    logger.error("Weather API failed - claim creation aborted", {
      userId: user._id.toString(),
      city,
      error: err.message
    });
    throw err;
  }

  const rainMm = extractRainSafely(currentWeather, CLAIM_CONFIG.RAINFALL_FALLBACK);
  validateWeatherData(rainMm, threshold);

  // ========== STEP 3: FRAUD PREVENTION ==========
  const today = formatLocalDateKey(getLocalDateOnly());

  // Check daily claim limit
  try {
    validateDailyClaimLimit(user.lastClaimDate, CLAIM_CONFIG.MAX_CLAIMS_PER_DAY);
  } catch (err) {
    logger.fraudCheck(user._id, "DAILY_LIMIT_EXCEEDED", true, 
      `Attempt to create 2nd claim on ${today}`);
    throw err;
  }

  // Check city lock
  try {
    validateCityLock(user.cityLockedDate, city, user.lockedCity);
  } catch (err) {
    logger.fraudCheck(user._id, "CITY_CHANGED_SAME_DAY", true, 
      `Attempted to change city from ${user.lockedCity} to ${city}`);
    throw err;
  }

  // Check weekly claim limit
  const weeklyLimit = checkWeeklyClaimLimit(user);
  if (!weeklyLimit.canClaim) {
    const err = new Error(
      `Weekly claim limit exceeded (${weeklyLimit.count}/${weeklyLimit.limit})`
    );
    err.statusCode = 429;
    err.errorCode = "WEEKLY_LIMIT_EXCEEDED";
    throw err;
  }

  // ========== STEP 4: CALCULATE PREMIUM & RISK ==========
  const weather = { rainMm, threshold };
  const triggerResult = runAutomationTriggers({
    weather,
    user,
    location: city,
    activityDrop: false
  });
  const triggerTypes = Array.isArray(triggerResult.triggerTypes) && triggerResult.triggerTypes.length > 0
    ? triggerResult.triggerTypes
    : (triggerResult.triggerType ? [triggerResult.triggerType] : []);
  const triggerType = triggerTypes[0] || triggerResult.triggerType || "rain";
  const triggerThresholds = triggerResult.weatherData?.thresholds || {};
  const triggerSocialEvent = triggerResult.weatherData?.socialEvent || null;

  const premiumBase = calculatePremium(user, weather, { location: city });
  const computedPremium = Math.max(20, premiumBase.premium + triggerResult.premiumDelta);

  let riskLevel = "low";
  if (computedPremium >= 140) riskLevel = "high";
  else if (computedPremium >= 115) riskLevel = "medium";

  // ========== STEP 5: REQUIRE ACTIVE POLICY ==========
  const policy = await getActivePolicyOrThrow(user, profile);
  policy.basePremium = premiumBase.basePremium;
  policy.dynamicPremium = computedPremium;
  policy.riskLevel = riskLevel;
  policy.location = city;
  policy.lastUpdated = new Date();
  await policy.save();

  // ========== STEP 6: CLAIM LIFECYCLE (ALWAYS UPSERT ONE DAILY RECORD) ==========
  const todayComp = await buildTodayCompensation(user);
  const floodThreshold = Number(triggerThresholds.flood_threshold || Math.max(threshold * 1.5, threshold + 10));
  const heatThreshold = Number(triggerThresholds.heat_threshold || weather.heatThreshold || process.env.TRIGGER_HEAT_THRESHOLD || 35);
  const pollutionThreshold = Number(triggerThresholds.pollution_threshold || process.env.TRIGGER_AQI_THRESHOLD || 150);
  const eligible = (() => {
    if (triggerTypes.length > 0) {
      return true;
    }

    switch (triggerType) {
      case "heat":
        return temperature > heatThreshold;
      case "pollution":
        return aqi > pollutionThreshold;
      case "flood":
        return rainMm > floodThreshold;
      case "social":
        return Boolean(triggerSocialEvent?.active);
      case "rain":
      default:
        return rainMm > threshold;
    }
  })();
  const basePayout = todayComp.payoutAmount || 0;
  const tieredPayout = eligible
    ? calculateTriggeredPayout({
        triggerType,
        triggerTypes,
        rainMm,
        rainThreshold: threshold,
        floodThreshold,
        temperature,
        heatThreshold,
        aqi,
        pollutionThreshold,
        socialEvent: triggerSocialEvent,
        baseAmount: basePayout
      })
    : 0;
  const cappedPayout = Math.min(tieredPayout, CLAIM_CONFIG.MAX_PAYOUT_AMOUNT);

  const claim = await upsertDailyClaimRecord({
    userId: user._id,
    city,
    rainMm,
    threshold,
    riskLevel: todayComp.riskLevel,
    eligible,
    amount: basePayout,
    payoutAmount: cappedPayout,
    maxPayoutAmount: CLAIM_CONFIG.MAX_PAYOUT_AMOUNT,
    autoTriggered: true,
    triggerType,
    triggerTypes
  });

  if (eligible) {
    logger.claimDecision(user._id, city, rainMm, threshold, "CLAIM_ELIGIBLE", {
      basePayout,
      tieredPayout,
      cappedPayout,
      rainRatio: threshold > 0 ? (rainMm / threshold).toFixed(2) : "0.00"
    });
  } else {
    await User.findByIdAndUpdate(user._id, {
      $inc: { safeDays: 1 },
      $set: {
        riskScore: computedPremium,
        location: city
      }
    });

    logger.claimDecision(user._id, city, rainMm, threshold, "NO_CLAIM_BELOW_THRESHOLD");
  }

  // ========== STEP 7: RETURN RESPONSE ==========
  return {
    city,
    rainMm,
    threshold,
    policy,
    premium: {
      basePremium: premiumBase.basePremium,
      dynamicPremium: computedPremium,
      riskLevel,
      breakdown: premiumBase.breakdown
    },
    weather: {
      rainMm,
      threshold,
      condition: currentWeather?.weather?.[0]?.main || "Unknown"
    },
    triggers: triggerResult.triggers,
    legacyTriggers: triggerResult.legacyTriggers,
    claim,
    claimDecision: claim?.status || (eligible ? "ELIGIBLE" : "NO_CLAIM"),
    fraudChecks: {
      dailyLimitOk: true,
      cityLockOk: true,
      weeklyLimitOk: weeklyLimit.canClaim
    }
  };
}

module.exports = { runAutomationForUser };

