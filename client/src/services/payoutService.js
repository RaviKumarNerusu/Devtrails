export function isPlanActive() {
  try {
    const raw = localStorage.getItem("activePlan");
    if (!raw) return false;
    const plan = JSON.parse(raw);
    if (plan?.status !== "active") return false;
    const validTill = Number(plan?.validTill || 0);
    if (!Number.isFinite(validTill) || validTill <= 0) return false;
    return Date.now() < validTill;
  } catch {
    return false;
  }
}

export function calculateRisk(rainMm, thresholdMm) {
  const rain = Number.isFinite(Number(rainMm)) ? Math.max(0, Number(rainMm)) : 0;
  const threshold = Number.isFinite(Number(thresholdMm)) ? Math.max(0, Number(thresholdMm)) : 0;

  if (threshold <= 0) return "UNKNOWN";
  if (rain < threshold * 0.5) return "LOW";
  if (rain < threshold) return "MEDIUM";
  if (rain < threshold * 1.5) return "HIGH";
  return "SEVERE";
}

export function calculatePayout(rainMm, thresholdMm, avgDailyEarning) {
  const rain = Number.isFinite(Number(rainMm)) ? Math.max(0, Number(rainMm)) : 0;
  const threshold = Number.isFinite(Number(thresholdMm)) ? Math.max(0, Number(thresholdMm)) : 0;
  const earning = Number.isFinite(Number(avgDailyEarning)) ? Math.max(0, Number(avgDailyEarning)) : 0;

  if (threshold <= 0 || earning <= 0) return 0;
  if (rain < threshold * 0.5) return 0;
  if (rain < threshold) return Math.min(earning * 0.3, earning);
  if (rain < threshold * 1.5) return Math.min(earning * 0.6, earning);
  return earning;
}

