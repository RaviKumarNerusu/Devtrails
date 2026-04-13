function normalizeRisk(value) {
  const risk = Number(value);
  if (!Number.isFinite(risk)) return 0;
  if (risk < 0) return 0;
  if (risk > 1) return 1;
  return risk;
}

function calculatePremium(risk_score) {
  const base_price = 100;
  const risk = normalizeRisk(risk_score);

  let premium = base_price * (1 + risk);

  if (risk < 0.3) {
    premium *= 0.9;
  } else if (risk > 0.7) {
    premium *= 1.2;
  }

  return Number(premium.toFixed(2));
}

module.exports = {
  calculatePremium
};
