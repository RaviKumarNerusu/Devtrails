const Claim = require("../models/Claim");

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

async function getFraudScore({ userId, rainMm = 0, threshold = 0, triggeredByWeather = true, isAutoTriggered = false }) {
  if (!userId) {
    return { fraud_score: 0, should_reject: false, reasons: [] };
  }

  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [claims24h, claims7d] = await Promise.all([
    Claim.countDocuments({ userId, createdAt: { $gte: last24Hours } }),
    Claim.countDocuments({ userId, createdAt: { $gte: last7Days } })
  ]);

  let score = 0;
  const reasons = [];

  if (claims24h >= 2) {
    score += 0.35 + Math.min(0.2, (claims24h - 2) * 0.1);
    reasons.push("multiple_claims_within_24h");
  }

  const weatherValid = triggeredByWeather && Number(rainMm) >= Number(threshold);
  if (!weatherValid) {
    score += 0.45;
    reasons.push("invalid_weather_trigger");
  }

  if (claims7d >= 5) {
    score += 0.3;
    reasons.push("too_frequent_claims");
  }

  if (isAutoTriggered && claims24h >= 3) {
    score += 0.15;
    reasons.push("auto_trigger_high_frequency");
  }

  const fraud_score = clamp01(score);
  return {
    fraud_score,
    should_reject: fraud_score > 0.7,
    reasons
  };
}

module.exports = {
  getFraudScore
};
