const axios = require("axios");
const { logAudit } = require("./auditLogService");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "https://devtrails-ml-service.onrender.com/predict";

function normalizeRiskScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

async function getRiskScore(data) {
  const payload = {
    temperature: Number(data?.temperature ?? 0) || 0,
    rainfall: Number(data?.rainfall ?? 0) || 0,
    aqi: Number(data?.aqi ?? 0) || 0,
    past_claims: Number(data?.past_claims ?? 0) || 0,
    location_risk: Number(data?.location_risk ?? 0) || 0
  };

  try {
    const response = await axios.post(ML_SERVICE_URL, payload, {
      timeout: Number(process.env.ML_SERVICE_TIMEOUT_MS || 10000)
    });

    const riskScore = normalizeRiskScore(response?.data?.risk_score);
    const factors = typeof response?.data?.factors === "object" && response?.data?.factors !== null ? response.data.factors : {};
    const modelVersion = String(response?.data?.model_version || "v1.0");

    console.log("ML Risk:", riskScore);

    await logAudit("ML_PREDICTION", data?.userId || null, {
      input: payload,
      risk_score: riskScore,
      factors,
      model_version: modelVersion,
      source: "ml_service"
    });

    return {
      risk_score: riskScore,
      factors,
      model_version: modelVersion
    };
  } catch (error) {
    const fallbackRiskScore = 0.5;
    console.error("ML service unavailable, using fallback risk score", error?.message || error);
    console.log("ML Risk:", fallbackRiskScore);

    await logAudit("ML_PREDICTION_FALLBACK", data?.userId || null, {
      input: payload,
      risk_score: fallbackRiskScore,
      factors: {},
      model_version: "fallback-v1",
      error: error?.message || "ML_SERVICE_ERROR"
    });

    return {
      risk_score: fallbackRiskScore,
      factors: {},
      model_version: "fallback-v1"
    };
  }
}

module.exports = {
  getRiskScore
};
