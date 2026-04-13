const cron = require("node-cron");
const Policy = require("../models/Policy");
const User = require("../models/User");
const PartnerProfile = require("../models/PartnerProfile");
const { fetchCurrentWeather } = require("./openWeatherService");
const { createAutoTriggeredClaim } = require("./claimService");
const logger = require("../utils/logger");

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

let triggerCronJob = null;

function mockAqiFromWeather(weather) {
  const rainMm = Number(weather?.rain?.["1h"] || weather?.rain?.["3h"] || 0) || 0;
  const temp = Number(weather?.main?.temp || 0) || 0;
  const clouds = Number(weather?.clouds?.all || 0) || 0;
  const derived = 30 + rainMm * 0.6 + temp * 1.2 + clouds * 0.3;
  return Math.max(10, Math.min(400, Math.round(derived)));
}

async function processHourlyParametricTriggers() {
  const tempThreshold = Number(process.env.TRIGGER_TEMP_THRESHOLD || 40);
  const aqiThreshold = Number(process.env.TRIGGER_AQI_THRESHOLD || 150);

  const activePolicies = await Policy.find({ isActive: true }).select("userId").lean();
  const userIds = Array.from(new Set(activePolicies.map((item) => String(item.userId)).filter(Boolean)));

  for (const userId of userIds) {
    try {
      const [user, profile] = await Promise.all([
        User.findById(userId).select("_id location").lean(),
        PartnerProfile.findOne({ userId }).select("city rainThresholdMm").lean()
      ]);

      if (!user) continue;
      const city = profile?.city || user.location;
      if (!city) continue;

      const weather = await fetchCurrentWeather(city);
      if (!weather) {
        logger.warn("Trigger engine skipped due to missing weather data", { userId, city });
        continue;
      }
      const rainfall = Number(weather?.rain?.["1h"] || weather?.rain?.["3h"] || 0) || 0;
      const temperature = Number(weather?.main?.temp || 0) || 0;
      const aqi = mockAqiFromWeather(weather);
      const rainThreshold = Number(profile?.rainThresholdMm || process.env.TRIGGER_RAIN_THRESHOLD || 15);

      let triggerType = null;
      if (rainfall > rainThreshold) triggerType = "weather";
      else if (temperature > tempThreshold) triggerType = "time";
      else if (aqi > aqiThreshold) triggerType = "event";

      if (!triggerType) {
        logger.debug("Trigger engine evaluated with no action", {
          userId,
          city,
          rainfall,
          temperature,
          aqi
        });
        continue;
      }

      await createAutoTriggeredClaim(user, triggerType);

      logger.info("Hourly trigger executed", {
        userId,
        city,
        triggerType,
        rainfall,
        temperature,
        aqi
      });
    } catch (error) {
      logger.error("Hourly trigger processing failed", {
        userId,
        error: error.message
      });
    }
  }
}

function startParametricTriggerEngine() {
  if (triggerCronJob) {
    return;
  }

  const enabled = String(process.env.PARAMETRIC_TRIGGER_ENGINE_ENABLED || "true").toLowerCase();
  if (enabled === "false" || enabled === "0" || enabled === "off") {
    logger.info("Parametric trigger engine disabled by environment");
    return;
  }

  triggerCronJob = cron.schedule("0 * * * *", () => {
    processHourlyParametricTriggers().catch((error) => {
      logger.error("Parametric trigger engine run failed", { error: error.message });
    });
  });

  logger.info("Parametric trigger engine started", { schedule: "0 * * * *" });
}

function stopParametricTriggerEngine() {
  if (!triggerCronJob) return;
  triggerCronJob.stop();
  triggerCronJob = null;
}

module.exports = {
  runAutomationTriggers,
  processHourlyParametricTriggers,
  startParametricTriggerEngine,
  stopParametricTriggerEngine
};

