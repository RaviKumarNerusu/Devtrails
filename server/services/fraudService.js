const Claim = require("../models/Claim");
const { logAudit } = require("./auditLogService");

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

async function getFraudScore({
  userId,
  rainMm = 0,
  threshold = 0,
  triggeredByWeather = true,
  isAutoTriggered = false,
  triggerType = "weather",
  riskScore = 0,
  locationMismatch = false
}) {
  if (!userId) {
    return { fraud_score: 0, should_reject: false, reasons: [] };
  }

  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [claims1h, claims24h, claims7d] = await Promise.all([
    Claim.countDocuments({ userId, createdAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) } }),
    Claim.countDocuments({ userId, createdAt: { $gte: last24Hours } }),
    Claim.countDocuments({ userId, createdAt: { $gte: last7Days } })
  ]);

  const recentClaims = await Claim.find({ userId, createdAt: { $gte: last7Days } })
    .sort({ createdAt: -1 })
    .select("city rainMm threshold status date trigger_type createdAt")
    .lean();

  const lastFiveClaims = recentClaims.slice(0, 5);

  let score = 0;
  const reasons = [];

  if (claims1h >= 2) {
    score += 0.25 + Math.min(0.2, (claims1h - 2) * 0.1);
    reasons.push("high_velocity_claims_1h");
  }

  if (claims24h >= 2) {
    score += 0.35 + Math.min(0.2, (claims24h - 2) * 0.1);
    reasons.push("multiple_claims_within_24h");
  }

  if (claims24h >= 3) {
    score += 0.1;
    reasons.push("duplicate_claim_attempt_pattern");
  }

  const weatherValid = triggeredByWeather && Number(rainMm) >= Number(threshold);
  if (!weatherValid) {
    score += 0.45;
    reasons.push("trigger_validation_failed_no_matching_weather");
  }

  const currentHourBucket = now.getHours();
  const patternMatches = lastFiveClaims.filter((item) => {
    const itemTrigger = String(item?.trigger_type || "weather").toLowerCase();
    const itemHour = new Date(item?.createdAt || now).getHours();
    return itemTrigger === String(triggerType || "weather").toLowerCase() && Math.abs(itemHour - currentHourBucket) <= 1;
  }).length;
  if (patternMatches >= 3) {
    score += 0.2;
    reasons.push("historical_pattern_repeated_trigger_time");
  }

  if (claims7d >= 5) {
    score += 0.3;
    reasons.push("too_frequent_claims");
  }

  // GPS spoofing proxy: abrupt city volatility in short windows.
  const uniqueCities = new Set(
    recentClaims
      .map((item) => String(item.city || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (uniqueCities.size >= 3) {
    score += 0.2;
    reasons.push("gps_spoofing_suspected_city_volatility");
  }

  // Historical anomaly proxy: repeated eligible/approved claims with rain below threshold.
  const fakeWeatherLikeClaims = recentClaims.filter((item) => {
    const status = String(item.status || "").toLowerCase();
    return (
      (status === "eligible" || status === "approved" || status === "claimed") &&
      Number(item.rainMm || 0) < Number(item.threshold || 0)
    );
  });
  if (fakeWeatherLikeClaims.length >= 2) {
    score += 0.25;
    reasons.push("historical_fake_weather_claim_pattern");
  }

  if (isAutoTriggered && claims24h >= 3) {
    score += 0.15;
    reasons.push("auto_trigger_high_frequency");
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
  await logAudit("FRAUD_DETECTED", userId, {
    fraud_score,
    claims1h,
    claims24h,
    claims7d,
    triggerType,
    reasons
  });

  return {
    fraud_score,
    should_reject: fraud_score > 0.7,
    reasons
  };
}

module.exports = {
  getFraudScore
};
