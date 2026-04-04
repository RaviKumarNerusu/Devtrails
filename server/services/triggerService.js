function runAutomationTriggers({ weather, user, location, activityDrop }) {
  const triggers = [];

  const rainMm = Number(weather?.rainMm || 0);
  const threshold = Number(weather?.threshold || 0);
  const now = new Date();
  const hour = now.getHours();

  // 1) Weather Trigger
  if (threshold > 0 && rainMm >= threshold) {
    triggers.push({ type: "weather", hit: true, premiumDelta: 20, claim: true });
  } else {
    triggers.push({ type: "weather", hit: false, premiumDelta: 0, claim: false });
  }

  // 2) Time Trigger
  const isNight = hour >= 20 || hour <= 6;
  triggers.push({ type: "time", hit: isNight, premiumDelta: isNight ? 10 : 0, claim: false });

  // 3) Location Trigger
  const loc = String(location || "").toLowerCase();
  const highRiskZone = ["industrial", "flood", "coastal", "high-risk", "lowland", "high_risk_area", "flood_zone"].some((k) =>
    loc.includes(k)
  );
  triggers.push({ type: "location", hit: highRiskZone, premiumDelta: highRiskZone ? 30 : 0, claim: false });

  // 4) Event Trigger
  const userActivityDrop = activityDrop === true || Number(user?.safeDays || 0) <= 1;
  triggers.push({ type: "event", hit: userActivityDrop, premiumDelta: userActivityDrop ? 10 : 0, claim: userActivityDrop });

  // 5) Claim Trigger (derived)
  const aggregatedRisk =
    (triggers.find((t) => t.type === "weather")?.hit ? 1 : 0) +
    (triggers.find((t) => t.type === "time")?.hit ? 1 : 0) +
    (triggers.find((t) => t.type === "location")?.hit ? 1 : 0) +
    (triggers.find((t) => t.type === "event")?.hit ? 1 : 0);
  const claimTrigger = aggregatedRisk >= 2 || (threshold > 0 && rainMm >= threshold);
  triggers.push({ type: "claim", hit: claimTrigger, premiumDelta: 0, claim: claimTrigger });

  return {
    triggers,
    premiumDelta: triggers.reduce((sum, t) => sum + (t.premiumDelta || 0), 0),
    shouldCreateClaim: claimTrigger
  };
}

module.exports = { runAutomationTriggers };

