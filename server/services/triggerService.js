const cron = require("node-cron");
const Policy = require("../models/Policy");
const User = require("../models/User");
const Claim = require("../models/Claim");
const PartnerProfile = require("../models/PartnerProfile");
const { fetchCurrentWeather, fetchFiveDayForecast } = require("./openWeatherService");
const { createAutoTriggeredClaim } = require("./claimService");
const {
  buildMockSocialEvent,
  resolveDisruptionTrigger,
  toNumber
} = require("../utils/disruptionRules");
const logger = require("../utils/logger");

function buildThresholdBundle(weather = {}) {
  const rainfallThreshold = toNumber(
    weather?.threshold ?? weather?.rainThreshold ?? process.env.TRIGGER_RAIN_THRESHOLD ?? 15,
    15
  );
  const heatThreshold = toNumber(weather?.heatThreshold ?? process.env.TRIGGER_HEAT_THRESHOLD ?? 35, 35);
  const pollutionThreshold = toNumber(weather?.pollutionThreshold ?? process.env.TRIGGER_AQI_THRESHOLD ?? 150, 150);
  const floodThreshold = toNumber(weather?.floodThreshold ?? Math.max(rainfallThreshold * 1.5, rainfallThreshold + 10), rainfallThreshold);

  return {
    rainfall_threshold: rainfallThreshold,
    heat_threshold: heatThreshold,
    pollution_threshold: pollutionThreshold,
    flood_threshold: floodThreshold
  };
}

function runAutomationTriggers({ weather, user, location, activityDrop }) {
  const rainMm = Number(weather?.rainMm || 0);
  const temperature = Number(weather?.temperature ?? weather?.temp ?? 0);
  const aqi = Number(weather?.aqi ?? 0);
  const thresholds = buildThresholdBundle(weather);
  const socialEvent = weather?.socialEvent || buildMockSocialEvent({ userId: user?._id, city: location });

  const disruption = resolveDisruptionTrigger({
    rainfall: rainMm,
    temperature,
    aqi,
    thresholds,
    socialEvent
  });

  const triggers = [];

  triggers.push({ type: "rain", hit: disruption.trigger_type === "rain", premiumDelta: disruption.trigger_type === "rain" ? 20 : 0, claim: disruption.trigger_type === "rain" });
  triggers.push({ type: "heat", hit: disruption.trigger_type === "heat", premiumDelta: disruption.trigger_type === "heat" ? 15 : 0, claim: disruption.trigger_type === "heat" });
  triggers.push({ type: "pollution", hit: disruption.trigger_type === "pollution", premiumDelta: disruption.trigger_type === "pollution" ? 15 : 0, claim: disruption.trigger_type === "pollution" });
  triggers.push({ type: "flood", hit: disruption.trigger_type === "flood", premiumDelta: disruption.trigger_type === "flood" ? 25 : 0, claim: disruption.trigger_type === "flood" });
  triggers.push({ type: "social", hit: disruption.trigger_type === "social", premiumDelta: disruption.trigger_type === "social" ? 10 : 0, claim: disruption.trigger_type === "social" });

  // Preserve legacy trigger labels for older screens while the new disruption model is adopted.
  const now = new Date();
  const hour = now.getHours();
  const isNight = hour >= 20 || hour <= 6;
  const loc = String(location || "").toLowerCase();
  const highRiskZone = ["industrial", "flood", "coastal", "high-risk", "lowland", "high_risk_area", "flood_zone"].some((k) =>
    loc.includes(k)
  );
  const userActivityDrop = activityDrop === true || Number(user?.safeDays || 0) <= 1;

  triggers.push({ type: "weather", hit: disruption.trigger_type === "rain", premiumDelta: 20, claim: disruption.trigger_type === "rain" });
  triggers.push({ type: "time", hit: disruption.trigger_type === "heat" || isNight, premiumDelta: disruption.trigger_type === "heat" ? 15 : isNight ? 10 : 0, claim: disruption.trigger_type === "heat" });
  triggers.push({ type: "location", hit: highRiskZone, premiumDelta: highRiskZone ? 30 : 0, claim: false });
  triggers.push({ type: "event", hit: disruption.trigger_type === "social" || userActivityDrop, premiumDelta: disruption.trigger_type === "social" ? 10 : userActivityDrop ? 10 : 0, claim: disruption.trigger_type === "social" || userActivityDrop });

  const claimTrigger = Boolean(disruption.trigger_type) || highRiskZone || userActivityDrop;
  triggers.push({ type: "claim", hit: claimTrigger, premiumDelta: 0, claim: claimTrigger });

  return {
    triggers,
    premiumDelta: triggers.reduce((sum, t) => sum + (t.premiumDelta || 0), 0),
    shouldCreateClaim: claimTrigger,
    triggerType: disruption.trigger_type,
    weatherData: {
      rainfall: rainMm,
      temperature,
      aqi,
      thresholds,
      socialEvent
    }
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

function mean(values) {
  const nums = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function stdDev(values, avg) {
  const nums = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (nums.length === 0) return 0;
  const variance = nums.reduce((sum, n) => sum + ((n - avg) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
}

async function computeDynamicThresholds({ userId, city, fallbackRainThreshold = 15 }) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [recentClaims, forecast] = await Promise.all([
    Claim.find({ userId, createdAt: { $gte: since } })
      .select("rainMm")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
    fetchFiveDayForecast(city).catch(() => null)
  ]);

  const rainHistory = recentClaims.map((item) => Number(item?.rainMm || 0));
  const tempHistory = Array.isArray(forecast?.list)
    ? forecast.list
      .map((item) => Number(item?.main?.temp))
      .filter((v) => Number.isFinite(v))
      .slice(0, 30)
    : [];

  const rainMean = mean(rainHistory);
  const rainStd = stdDev(rainHistory, rainMean);
  const tempMean = mean(tempHistory);
  const tempStd = stdDev(tempHistory, tempMean);

  const rainfallThreshold = Math.max(1, Number((rainHistory.length > 0 ? (rainMean + rainStd) : fallbackRainThreshold).toFixed(2)));
  const temperatureThreshold = Number((tempHistory.length > 0 ? (tempMean + tempStd) : Number(process.env.TRIGGER_TEMP_THRESHOLD || 40)).toFixed(2));

  return {
    rainfallThreshold,
    temperatureThreshold,
    details: {
      rain_mean: Number(rainMean.toFixed(2)),
      rain_std: Number(rainStd.toFixed(2)),
      temp_mean: Number(tempMean.toFixed(2)),
      temp_std: Number(tempStd.toFixed(2)),
      history_points: {
        rainfall: rainHistory.length,
        temperature: tempHistory.length
      }
    }
  };
}

async function processHourlyParametricTriggers() {
  const aqiThreshold = toNumber(process.env.TRIGGER_AQI_THRESHOLD || 150, 150);

  const activePolicies = await Policy.find({ isActive: true }).select("userId").lean();
  const userIds = Array.from(new Set(activePolicies.map((item) => String(item.userId)).filter(Boolean)));

  for (const userId of userIds) {
    try {
      const [user, profile] = await Promise.all([
        User.findById(userId).select("_id location risk_score riskScore").lean(),
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

      const dynamicThresholds = await computeDynamicThresholds({
        userId,
        city,
        fallbackRainThreshold: Number(profile?.rainThresholdMm || process.env.TRIGGER_RAIN_THRESHOLD || 15)
      });

      const userRisk = Number(user?.risk_score ?? user?.riskScore ?? 0);
      const riskMultiplier = userRisk > 0.7 ? 0.9 : 1;
      const rainThreshold = Number((dynamicThresholds.rainfallThreshold * riskMultiplier).toFixed(2));
      const tempThreshold = Number((dynamicThresholds.temperatureThreshold * riskMultiplier).toFixed(2));
      const floodThreshold = Number(Math.max(rainThreshold * 1.5, rainThreshold + 10).toFixed(2));
      const socialEvent = buildMockSocialEvent({ userId, city });
      const weatherData = {
        rainfall,
        temperature,
        aqi,
        thresholds: {
          rainfall_threshold: rainThreshold,
          heat_threshold: tempThreshold,
          pollution_threshold: aqiThreshold,
          flood_threshold: floodThreshold
        },
        socialEvent
      };

      const triggerDecision = resolveDisruptionTrigger({
        rainfall,
        temperature,
        aqi,
        thresholds: weatherData.thresholds,
        socialEvent
      });

      console.log("Trigger Type:", triggerDecision.trigger_type);
      console.log("Weather Data:", weatherData);

      let triggerType = triggerDecision.trigger_type;

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

      await createAutoTriggeredClaim(user, triggerType, {
        dynamicThreshold: rainThreshold,
        currentWeather: weather,
        weatherData,
        socialEvent,
        thresholdUsed: {
          rainfall_threshold: rainThreshold,
          temperature_threshold: tempThreshold,
          aqi_threshold: aqiThreshold,
          flood_threshold: floodThreshold,
          risk_multiplier: riskMultiplier,
          dynamic_details: dynamicThresholds.details
        }
      });

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

