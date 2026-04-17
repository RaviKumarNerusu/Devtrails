const Claim = require("../models/Claim");
const { logAudit } = require("./auditLogService");
const { normalizeTriggerType, toNumber } = require("../utils/disruptionRules");

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function parseClaimHour(value, fallbackDate = new Date()) {
  const date = value ? new Date(value) : fallbackDate;
  return Number.isNaN(date.getTime()) ? fallbackDate.getHours() : date.getHours();
}

function evaluateFraudSignals({
  claims = [],
  triggerType = "rain",
  rainMm = 0,
  threshold = 0,
  temperature = 0,
  heatThreshold = 40,
  aqi = 0,
  pollutionThreshold = 150,
  floodThreshold = 0,
  socialEvent = null,
  riskScore = 0,
  locationMismatch = false,
  now = new Date()
} = {}) {
  const normalizedTriggerType = normalizeTriggerType(triggerType);
  const recentClaims = [...claims].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  const lastFiveClaims = recentClaims.slice(0, 5);

  let score = 0;
  const reasons = [];
  let autoReject = false;

  const claims1h = recentClaims.filter((item) => now.getTime() - new Date(item.createdAt || now).getTime() <= 60 * 60 * 1000).length;
  const claims6h = recentClaims.filter((item) => now.getTime() - new Date(item.createdAt || now).getTime() <= 6 * 60 * 60 * 1000).length;
  const claims24h = recentClaims.filter((item) => now.getTime() - new Date(item.createdAt || now).getTime() <= 24 * 60 * 60 * 1000).length;
  const claims7d = recentClaims.filter((item) => now.getTime() - new Date(item.createdAt || now).getTime() <= 7 * 24 * 60 * 60 * 1000).length;

  if (claims1h >= 2) {
    score += 0.25 + Math.min(0.2, (claims1h - 2) * 0.1);
    reasons.push("High frequency");
  }

  if (claims6h >= 2) {
    score += 0.3;
    reasons.push("High frequency");
  }

  if (claims6h >= 3 || claims1h >= 3) {
    autoReject = true;
    reasons.push("claim_velocity_extreme");
  }

  if (claims24h >= 3) {
    score += 0.2;
    reasons.push("Duplicate claim");
  }

  if (claims7d >= 5) {
    score += 0.3;
    reasons.push("Repeated pattern detected");
  }

  const sameTriggerCount = lastFiveClaims.filter((item) => normalizeTriggerType(item?.trigger_type || item?.triggerType) === normalizedTriggerType).length;
  if (sameTriggerCount >= 3) {
    score += 0.3;
    reasons.push("Repeated pattern detected");
  }

  const currentHourBucket = parseClaimHour(now, now);
  const patternMatches = lastFiveClaims.filter((item) => {
    const itemTrigger = normalizeTriggerType(item?.trigger_type || item?.triggerType);
    const itemHour = parseClaimHour(item?.createdAt, now);
    return itemTrigger === normalizedTriggerType && Math.abs(itemHour - currentHourBucket) <= 1;
  }).length;
  if (patternMatches >= 3) {
    score += 0.2;
    reasons.push("Repeated pattern detected");
  }

  const weatherValid = (() => {
    switch (normalizedTriggerType) {
      case "heat":
        return toNumber(temperature, 0) >= toNumber(heatThreshold, 38);
      case "pollution":
        return toNumber(aqi, 0) > toNumber(pollutionThreshold, 0);
      case "flood":
        return toNumber(rainMm, 0) > toNumber(floodThreshold, 0);
      case "social":
        return Boolean(socialEvent?.active);
      case "rain":
      default:
        return toNumber(rainMm, 0) > toNumber(threshold, 0);
    }
  })();

  if (!weatherValid) {
    score += 0.4;
    reasons.push("Invalid disruption trigger");
  }

  if (locationMismatch) {
    score += 0.25;
    reasons.push("location_mismatch_detected");
  }

  if (Number(riskScore) > 0.7 && claims7d >= 4) {
    score += 0.1;
    reasons.push("high_risk_with_frequent_claims_suspicious");
  }

  const fraud_score = clamp01(score);
  const fraud_reason = reasons.join("; ");

  return {
    fraud_score,
    fraud_reason,
    reasons,
    should_reject: fraud_score > 0.7 || autoReject,
    claims1h,
    claims6h,
    claims24h,
    claims7d
  };
}

async function getFraudScore({
  userId,
  rainMm = 0,
  threshold = 0,
  triggeredByWeather = true,
  isAutoTriggered = false,
  triggerType = "rain",
  temperature = 0,
  heatThreshold = 38,
  aqi = 0,
  pollutionThreshold = 150,
  floodThreshold = 0,
  socialEvent = null,
  riskScore = 0,
  locationMismatch = false,
  weatherData = null,
  cityName = ""
}) {
  if (!userId) {
    return { fraud_score: 0, should_reject: false, reasons: [], fraud_reason: "" };
  }

  const demoModeEnabled = String(process.env.DEMO_MODE || "false").trim().toLowerCase() === "true";
  const normalizedCityName = String(cityName || weatherData?.city || weatherData?.location || "").toLowerCase();
  if (demoModeEnabled && normalizedCityName.includes("mysore")) {
    return {
      fraud_score: 0,
      fraud_reason: "demo_mode_bypass",
      should_reject: false,
      reasons: ["demo_mode_bypass"]
    };
  }

  const now = new Date();
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentClaims = await Claim.find({ userId, createdAt: { $gte: last7Days } })
    .sort({ createdAt: -1 })
    .select("city rainMm threshold status date trigger_type triggerType createdAt fraud_reason")
    .lean();

  const fraudSignals = evaluateFraudSignals({
    claims: recentClaims,
    triggerType,
    rainMm,
    threshold,
    temperature,
    heatThreshold,
    aqi,
    pollutionThreshold,
    floodThreshold,
    socialEvent,
    riskScore,
    locationMismatch,
    now
  });

  const fraud_score = fraudSignals.fraud_score;
  const fraud_reason = fraudSignals.fraud_reason;
  const reasons = fraudSignals.reasons;
  await logAudit("FRAUD_DETECTED", userId, {
    fraud_score,
    fraud_reason,
    claims1h: fraudSignals.claims1h,
    claims24h: fraudSignals.claims24h,
    claims7d: fraudSignals.claims7d,
    triggerType,
    trigger_type: normalizeTriggerType(triggerType),
    reasons,
    weatherData
  });

  return {
    fraud_score,
    fraud_reason,
    should_reject: fraudSignals.should_reject,
    reasons
  };
}

module.exports = {
  evaluateFraudSignals,
  getFraudScore
};
