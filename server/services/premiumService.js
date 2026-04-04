function isUnsafeLocation(location) {
  const value = String(location || "").toLowerCase();
  return ["industrial", "flood", "coastal", "lowland", "high-risk", "high_risk_area", "flood_zone"].some((k) =>
    value.includes(k)
  );
}

function calculatePremium(user, weather, locationRisk = {}) {
  const base = 100;
  let premium = base;

  const rainMm = Number(weather?.rainMm ?? weather?.rain_mm ?? 0) || 0;
  const threshold = Number(weather?.threshold ?? 0) || 0;
  const heavyRain = threshold > 0 ? rainMm >= threshold : rainMm >= 10;
  const weatherRisk = heavyRain ? 20 : 0;
  premium += weatherRisk;

  const locationUnsafe = locationRisk?.unsafe === true || isUnsafeLocation(locationRisk?.location || "");
  const locationRiskValue = locationUnsafe ? 30 : 0;
  premium += locationRiskValue;

  const safeDays = Number(user?.safeDays || 0);
  const safeDiscount = safeDays > 7 ? -10 : 0;
  premium += safeDiscount;

  const claims = Number(user?.claimHistoryCount || 0);
  const claimPenalty = claims > 2 ? 15 : 0;
  premium += claimPenalty;

  premium = Math.max(20, Math.round(premium));

  let riskLevel = "low";
  if (premium >= 140) riskLevel = "high";
  else if (premium >= 115) riskLevel = "medium";

  return {
    premium,
    riskLevel,
    basePremium: base,
    breakdown: {
      base,
      weatherRisk,
      locationRisk: locationRiskValue,
      safeDiscount,
      claimPenalty
    }
  };
}

module.exports = { calculatePremium };

