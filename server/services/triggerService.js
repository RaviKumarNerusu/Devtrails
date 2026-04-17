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

function isDemoModeEnabled() {
  return String(process.env.DEMO_MODE || "false").trim().toLowerCase() === "true";
}

function isDemoCity(city) {
  const cityName = (city || "").toLowerCase();
  return cityName.includes("mysore");
}

function getDemoWeatherOverride(city) {
  if (!isDemoModeEnabled() || !isDemoCity(city)) {
    return null;
  }

  console.log("DEMO MODE ACTIVE: Mysore forced rainfall trigger");
  return {
    rainfall: 50,
    temperature: 26,
    aqi: 80,
    AQI: 80,
    condition: "Heavy Rain"
  };
}

function buildThresholdBundle(weather = {}) {
  const rainfallThreshold = toNumber(
    weather?.threshold ?? weather?.rainThreshold ?? process.env.TRIGGER_RAIN_THRESHOLD ?? 15,
    15
  );
  const heatThreshold = toNumber(weather?.heatThreshold ?? process.env.TRIGGER_HEAT_THRESHOLD ?? 38, 38);
  const pollutionThreshold = toNumber(weather?.pollutionThreshold ?? process.env.TRIGGER_AQI_THRESHOLD ?? 150, 150);
  const floodThreshold = toNumber(weather?.floodThreshold ?? Math.max(rainfallThreshold * 1.5, rainfallThreshold + 10), rainfallThreshold);

  return {
    rainfall_threshold: rainfallThreshold,
    heat_threshold: heatThreshold,
    pollution_threshold: pollutionThreshold,
    flood_threshold: floodThreshold
  };
}

function getUserThresholdConfig(user = {}, profile = {}, fallback = {}) {
  const thresholds = {
    rain: toNumber(user?.thresholds?.rain ?? profile?.rainThresholdMm ?? fallback?.rain ?? process.env.TRIGGER_RAIN_THRESHOLD ?? 15, 15),
    heat: toNumber(user?.thresholds?.heat ?? fallback?.heat ?? process.env.TRIGGER_HEAT_THRESHOLD ?? 38, 38),
    aqi: toNumber(user?.thresholds?.aqi ?? fallback?.aqi ?? process.env.TRIGGER_AQI_THRESHOLD ?? 150, 150),
    flood: toNumber(
      user?.thresholds?.flood ?? fallback?.flood ?? Math.max((profile?.rainThresholdMm || 15) * 1.5, (profile?.rainThresholdMm || 15) + 10),
      30
    ),
    social: typeof user?.thresholds?.social === "boolean" ? user.thresholds.social : true
  };

  const enabled = {
    rain: user?.enabled_factors?.rain !== false,
    heat: user?.enabled_factors?.heat !== false,
    aqi: user?.enabled_factors?.aqi !== false,
    flood: user?.enabled_factors?.flood !== false,
    social: user?.enabled_factors?.social !== false
  };

  return { thresholds, enabled };
}

function runAutomationTriggers({ weather, user, location, activityDrop }) {
  const demoOverride = getDemoWeatherOverride(location || weather?.city || user?.location);
  const effectiveWeather = demoOverride
    ? {
      ...weather,
      rainMm: demoOverride.rainfall,
      temperature: demoOverride.temperature,
      temp: demoOverride.temperature,
      aqi: demoOverride.aqi,
      condition: demoOverride.condition
    }
    : weather;

  const rainMm = Number(effectiveWeather?.rainMm || 0);
  const temperature = Number(effectiveWeather?.temperature ?? effectiveWeather?.temp ?? 0);
  const aqi = Number(effectiveWeather?.aqi ?? 0);
  const profileLike = { rainThresholdMm: effectiveWeather?.threshold };
  const userConfig = getUserThresholdConfig(user, profileLike, {
    rain: effectiveWeather?.threshold,
    heat: effectiveWeather?.heatThreshold,
    aqi: effectiveWeather?.pollutionThreshold,
    flood: effectiveWeather?.floodThreshold
  });
  const thresholds = {
    rainfall_threshold: userConfig.thresholds.rain,
    heat_threshold: userConfig.thresholds.heat,
    pollution_threshold: userConfig.thresholds.aqi,
    flood_threshold: userConfig.thresholds.flood
  };
  const enabled = userConfig.enabled;
  const socialEvent = weather?.socialEvent || buildMockSocialEvent({ userId: user?._id, city: location });

  const matchedTriggerTypes = [];
  if (enabled.rain && rainMm >= thresholds.rainfall_threshold) matchedTriggerTypes.push("rain");
  if (enabled.heat && temperature >= thresholds.heat_threshold) matchedTriggerTypes.push("heat");
  if (enabled.aqi && aqi >= thresholds.pollution_threshold) matchedTriggerTypes.push("pollution");
  if (enabled.flood && rainMm >= thresholds.flood_threshold) matchedTriggerTypes.push("flood");
  if (enabled.social && thresholds.social !== false && socialEvent?.active === true) matchedTriggerTypes.push("social");

  const dedupedTriggers = [...new Set(matchedTriggerTypes)];
  const detectedTriggers = dedupedTriggers;
  let triggerType = detectedTriggers[0] || null;
  let triggerTypes = detectedTriggers;
  let shouldCreateClaim = detectedTriggers.length > 0;

  console.log("Triggers detected:", detectedTriggers);

  if (triggerType === "heat" || triggerTypes.includes("heat")) {
    console.log("Heat Trigger:", temperature);
    console.log("Heat Claim Triggered");
  }

  if (demoOverride) {
    triggerType = "rain";
    triggerTypes = ["rain"];
    shouldCreateClaim = true;
  }

  const triggers = [];
  const legacyTriggers = [];

  const hasTrigger = (name) => triggerTypes.includes(name);
  triggers.push({ type: "rain", hit: hasTrigger("rain"), premiumDelta: hasTrigger("rain") ? 20 : 0, claim: hasTrigger("rain") });
  triggers.push({ type: "heat", hit: hasTrigger("heat"), premiumDelta: hasTrigger("heat") ? 15 : 0, claim: hasTrigger("heat") });
  triggers.push({ type: "pollution", hit: hasTrigger("pollution"), premiumDelta: hasTrigger("pollution") ? 15 : 0, claim: hasTrigger("pollution") });
  triggers.push({ type: "flood", hit: hasTrigger("flood"), premiumDelta: hasTrigger("flood") ? 25 : 0, claim: hasTrigger("flood") });
  triggers.push({ type: "social", hit: hasTrigger("social"), premiumDelta: hasTrigger("social") ? 10 : 0, claim: hasTrigger("social") });

  // Preserve legacy trigger labels for older screens while the new disruption model is adopted.
  const now = new Date();
  const hour = now.getHours();
  const isNight = hour >= 20 || hour <= 6;
  const loc = String(location || "").toLowerCase();
  const highRiskZone = ["industrial", "flood", "coastal", "high-risk", "lowland", "high_risk_area", "flood_zone"].some((k) =>
    loc.includes(k)
  );
  const userActivityDrop = activityDrop === true || Number(user?.safeDays || 0) <= 1;

  legacyTriggers.push({ type: "weather", hit: hasTrigger("rain"), premiumDelta: hasTrigger("rain") ? 20 : 0, claim: hasTrigger("rain"), trigger_type: triggerType });
  legacyTriggers.push({ type: "time", hit: hasTrigger("heat") || isNight, premiumDelta: hasTrigger("heat") ? 15 : isNight ? 10 : 0, claim: hasTrigger("heat"), trigger_type: triggerType });
  legacyTriggers.push({ type: "location", hit: highRiskZone, premiumDelta: highRiskZone ? 30 : 0, claim: false, trigger_type: triggerType });
  legacyTriggers.push({ type: "event", hit: hasTrigger("social") || userActivityDrop, premiumDelta: hasTrigger("social") ? 10 : userActivityDrop ? 10 : 0, claim: hasTrigger("social"), trigger_type: triggerType });

  const claimTrigger = shouldCreateClaim;
  legacyTriggers.push({ type: "claim", hit: claimTrigger || highRiskZone || userActivityDrop, premiumDelta: 0, claim: claimTrigger, trigger_type: triggerType });

  return {
    triggers,
    legacyTriggers,
    premiumDelta: triggers.reduce((sum, t) => sum + (t.premiumDelta || 0), 0),
    shouldCreateClaim,
    triggerType,
    triggerTypes,
    detectedTriggers,
    trigger_type: triggerType,
    weatherData: {
      rainfall: rainMm,
      temperature,
      aqi,
      thresholds: {
        ...thresholds,
        social_threshold: userConfig.thresholds.social
      },
      enabled_factors: enabled,
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

      const demoOverride = getDemoWeatherOverride(city);
      const weather = demoOverride
        ? {
          main: { temp: demoOverride.temperature },
          rain: { "1h": demoOverride.rainfall },
          weather: [{ main: demoOverride.condition }]
        }
        : await fetchCurrentWeather(city);

      if (!weather) {
        logger.warn("Trigger engine skipped due to missing weather data", { userId, city });
        continue;
      }
      const rainfall = demoOverride
        ? Number(demoOverride.rainfall)
        : Number(weather?.rain?.["1h"] || weather?.rain?.["3h"] || 0) || 0;
      const temperature = demoOverride ? Number(demoOverride.temperature) : Number(weather?.main?.temp || 0) || 0;
      const aqi = demoOverride ? Number(demoOverride.aqi) : mockAqiFromWeather(weather);

      const dynamicThresholds = await computeDynamicThresholds({
        userId,
        city,
        fallbackRainThreshold: Number(user?.thresholds?.rain || profile?.rainThresholdMm || process.env.TRIGGER_RAIN_THRESHOLD || 15)
      });

      const userRisk = Number(user?.risk_score ?? user?.riskScore ?? 0);
      const riskMultiplier = userRisk > 0.7 ? 0.9 : 1;
      const userConfig = getUserThresholdConfig(user, profile, {
        rain: dynamicThresholds.rainfallThreshold,
        heat: dynamicThresholds.temperatureThreshold,
        aqi: aqiThreshold,
        flood: Math.max(dynamicThresholds.rainfallThreshold * 1.5, dynamicThresholds.rainfallThreshold + 10)
      });
      const rainThreshold = Number((userConfig.thresholds.rain * riskMultiplier).toFixed(2));
      const tempThreshold = Number((userConfig.thresholds.heat * riskMultiplier).toFixed(2));
      const floodThreshold = Number((userConfig.thresholds.flood * riskMultiplier).toFixed(2));
      const socialEvent = buildMockSocialEvent({ userId, city });
      const weatherData = {
        rainfall,
        temperature,
        aqi,
        thresholds: {
          rainfall_threshold: rainThreshold,
          heat_threshold: tempThreshold,
          pollution_threshold: Number(userConfig.thresholds.aqi || aqiThreshold),
          flood_threshold: floodThreshold,
          social_threshold: userConfig.thresholds.social
        },
        enabled_factors: userConfig.enabled,
        socialEvent
      };

      const triggerDecision = runAutomationTriggers({
        weather: {
          rainMm: rainfall,
          temperature,
          aqi,
          threshold: rainThreshold,
          heatThreshold: tempThreshold,
          pollutionThreshold: Number(userConfig.thresholds.aqi || aqiThreshold),
          floodThreshold,
          socialEvent
        },
        user,
        location: city,
        activityDrop: false
      });

      logger.info("Trigger evaluated", {
        userId,
        city,
        trigger_type: triggerDecision.trigger_type,
        trigger_types: triggerDecision.triggerTypes,
        weatherData
      });

      const triggerType = triggerDecision.trigger_type;
      const triggerTypes = triggerDecision.triggerTypes || (triggerType ? [triggerType] : []);
      const shouldCreateClaim = Boolean(triggerType);

      if (!shouldCreateClaim) {
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
        weatherData: {
          ...weatherData,
          trigger_types: triggerTypes
        },
        socialEvent,
        triggerTypes,
        thresholdUsed: {
          rainfall_threshold: rainThreshold,
          heat_threshold: tempThreshold,
          aqi_threshold: aqiThreshold,
          flood_threshold: floodThreshold,
          social_threshold: userConfig.thresholds.social,
          enabled_factors: userConfig.enabled,
          risk_multiplier: riskMultiplier,
          dynamic_details: dynamicThresholds.details
        }
      });

      logger.info("Hourly trigger executed", {
        userId,
        city,
        triggerType,
        trigger_type: triggerType,
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

