const axios = require("axios");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:5001/predict";

function normalizeRiskScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

async function getRiskScore(data) {
  try {
    const payload = {
      temperature: Number(data?.temperature ?? 0) || 0,
      rainfall: Number(data?.rainfall ?? 0) || 0,
      aqi: Number(data?.aqi ?? 0) || 0,
      past_claims: Number(data?.past_claims ?? 0) || 0,
      location_risk: Number(data?.location_risk ?? 0) || 0
    };

    const response = await axios.post(ML_SERVICE_URL, payload, {
      timeout: Number(process.env.ML_SERVICE_TIMEOUT_MS || 3000)
    });

    return normalizeRiskScore(response?.data?.risk_score);
  } catch (error) {
    // Keep existing claim flow resilient even if ML service is temporarily unavailable.
    return 0;
  }
}

module.exports = {
  getRiskScore
};
