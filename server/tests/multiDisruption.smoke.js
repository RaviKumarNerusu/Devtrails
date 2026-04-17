const assert = require("assert");

const { buildMockSocialEvent, normalizeTriggerType, resolveDisruptionTrigger } = require("../utils/disruptionRules");
const { evaluateFraudSignals } = require("../services/fraudService");
const { calculatePredictionMetrics } = require("../controllers/dashboardController");
const { calculateTriggerPayout } = require("../services/claimService");

function buildClaims(createdAtOffsetsHours, triggerType = "rain") {
  return createdAtOffsetsHours.map((offsetHours) => ({
    trigger_type: triggerType,
    createdAt: new Date(Date.now() - offsetHours * 60 * 60 * 1000),
    risk_score: 0.4,
    city: "Bangalore"
  }));
}

function main() {
  assert.strictEqual(normalizeTriggerType("weather"), "rain");
  assert.strictEqual(normalizeTriggerType("event"), "social");

  const rainTrigger = resolveDisruptionTrigger({
    rainfall: 26,
    temperature: 31,
    aqi: 95,
    thresholds: {
      rainfall_threshold: 20,
      heat_threshold: 40,
      pollution_threshold: 150,
      flood_threshold: 30
    }
  });
  assert.strictEqual(rainTrigger.trigger_type, "rain");

  const heatTrigger = resolveDisruptionTrigger({
    rainfall: 10,
    temperature: 45,
    aqi: 90,
    thresholds: {
      rainfall_threshold: 20,
      heat_threshold: 40,
      pollution_threshold: 150,
      flood_threshold: 30
    }
  });
  assert.strictEqual(heatTrigger.trigger_type, "heat");

  const pollutionTrigger = resolveDisruptionTrigger({
    rainfall: 10,
    temperature: 30,
    aqi: 201,
    thresholds: {
      rainfall_threshold: 20,
      heat_threshold: 40,
      pollution_threshold: 150,
      flood_threshold: 30
    }
  });
  assert.strictEqual(pollutionTrigger.trigger_type, "pollution");

  const socialEvent = buildMockSocialEvent({ userId: "user-1", city: "Bangalore", forceActive: true });
  assert.strictEqual(socialEvent.active, true);
  const socialTrigger = resolveDisruptionTrigger({
    rainfall: 0,
    temperature: 0,
    aqi: 0,
    socialEvent,
    thresholds: {
      rainfall_threshold: 20,
      heat_threshold: 40,
      pollution_threshold: 150,
      flood_threshold: 30
    }
  });
  assert.strictEqual(socialTrigger.trigger_type, "social");

  const earning = 1200;
  const rainPayout = calculateTriggerPayout({
    triggerContext: rainTrigger,
    rainMm: 26,
    temperature: 31,
    aqi: 95,
    avgDailyEarning: earning
  });
  assert.ok(rainPayout.payoutAmount > 0, "Rain trigger should produce payout");

  const heatPayout = calculateTriggerPayout({
    triggerContext: heatTrigger,
    rainMm: 10,
    temperature: 45,
    aqi: 90,
    avgDailyEarning: earning
  });
  assert.ok(heatPayout.payoutAmount > 0, "Heat trigger should produce payout");

  const pollutionPayout = calculateTriggerPayout({
    triggerContext: pollutionTrigger,
    rainMm: 10,
    temperature: 30,
    aqi: 201,
    avgDailyEarning: earning
  });
  assert.ok(pollutionPayout.payoutAmount > 0, "Pollution trigger should produce payout");

  const floodTrigger = resolveDisruptionTrigger({
    rainfall: 45,
    temperature: 30,
    aqi: 80,
    thresholds: {
      rainfall_threshold: 20,
      heat_threshold: 40,
      pollution_threshold: 150,
      flood_threshold: 30
    }
  });
  assert.strictEqual(floodTrigger.trigger_type, "flood");

  const floodPayout = calculateTriggerPayout({
    triggerContext: floodTrigger,
    rainMm: 45,
    temperature: 30,
    aqi: 80,
    avgDailyEarning: earning
  });
  assert.ok(floodPayout.payoutAmount > 0, "Flood trigger should produce payout");

  const socialPayout = calculateTriggerPayout({
    triggerContext: socialTrigger,
    rainMm: 0,
    temperature: 0,
    aqi: 0,
    avgDailyEarning: earning
  });
  assert.ok(socialPayout.payoutAmount > 0, "Social trigger should produce payout");

  const invalidFraud = evaluateFraudSignals({
    claims: buildClaims([1, 2, 3, 4, 5], "rain"),
    triggerType: "heat",
    rainMm: 2,
    threshold: 20,
    temperature: 28,
    heatThreshold: 40,
    aqi: 60,
    pollutionThreshold: 150,
    floodThreshold: 30,
    socialEvent: { active: false }
  });
  assert.ok(invalidFraud.fraud_score >= 0.4);
  assert.ok(invalidFraud.fraud_reason.includes("Invalid disruption trigger"));

  const repeatedFraud = evaluateFraudSignals({
    claims: buildClaims([0.5, 1, 1.5, 2, 2.5], "rain"),
    triggerType: "rain",
    rainMm: 28,
    threshold: 20,
    temperature: 32,
    heatThreshold: 40,
    aqi: 60,
    pollutionThreshold: 150,
    floodThreshold: 30,
    socialEvent: { active: false }
  });
  assert.ok(repeatedFraud.fraud_score >= 0.3);
  assert.ok(repeatedFraud.fraud_reason.includes("Repeated pattern detected") || repeatedFraud.fraud_reason.includes("High frequency"));

  const predictionMetrics = calculatePredictionMetrics([
    { risk_score: 0.2, createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
    { risk_score: 0.4, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    { risk_score: 0.6, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) }
  ]);
  assert.ok(predictionMetrics.next_week_risk > 0);
  assert.ok(predictionMetrics.avg_risk > 0);
  assert.strictEqual(predictionMetrics.total_claims_last_week, 3);

  console.log("MULTI_DISRUPTION_SMOKE_OK");
}

main();