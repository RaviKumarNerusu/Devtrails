function normalizeNonNegativeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function calculateRisk(rainMm, thresholdMm) {
  const rain = normalizeNonNegativeNumber(rainMm);
  const threshold = normalizeNonNegativeNumber(thresholdMm);

  if (threshold <= 0) return "UNKNOWN";

  if (rain < threshold * 0.5) return "LOW";
  if (rain < threshold) return "MEDIUM";
  if (rain < threshold * 1.5) return "HIGH";
  return "SEVERE";
}

function calculatePayout(rainMm, thresholdMm, avgDailyEarning) {
  const rain = normalizeNonNegativeNumber(rainMm);
  const threshold = normalizeNonNegativeNumber(thresholdMm);
  const earning = normalizeNonNegativeNumber(avgDailyEarning);

  if (threshold <= 0 || earning <= 0) return 0;

  if (rain < threshold * 0.5) return 0;
  if (rain < threshold) return earning * 0.3;
  if (rain < threshold * 1.5) return earning * 0.6;
  return earning;
}

module.exports = {
  calculateRisk,
  calculatePayout
};

