const SOCIAL_EVENT_TYPES = ["curfew", "strike", "zone_closure"];
const CANONICAL_TRIGGER_TYPES = ["rain", "heat", "pollution", "flood", "social"];
const LEGACY_TRIGGER_ALIASES = {
  weather: "rain",
  event: "social",
  location: "flood",
  time: "heat"
};

function toNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeTriggerType(value) {
  const triggerType = String(value || "rain").toLowerCase();

  if (LEGACY_TRIGGER_ALIASES[triggerType]) return LEGACY_TRIGGER_ALIASES[triggerType];

  if (CANONICAL_TRIGGER_TYPES.includes(triggerType)) {
    return triggerType;
  }

  return "rain";
}

function readBooleanEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  return !(normalized === "false" || normalized === "0" || normalized === "off");
}

function buildMockSocialEvent({ userId = null, city = "", forceActive = null, activeRate } = {}) {
  const envActive = readBooleanEnv("SOCIAL_DISRUPTION_MOCK_ACTIVE", false);
  const activeProbability = Number.isFinite(Number(activeRate))
    ? Number(activeRate)
    : Number(process.env.SOCIAL_EVENT_ACTIVE_RATE || 0.2);

  let active;
  if (typeof forceActive === "boolean") {
    active = forceActive;
  } else if (envActive) {
    active = true;
  } else {
    active = Math.random() < Math.min(1, Math.max(0, activeProbability));
  }

  const seed = `${String(userId || "")}|${String(city || "")}|${new Date().getUTCFullYear()}-${new Date().getUTCMonth()}-${new Date().getUTCDate()}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return {
    type: SOCIAL_EVENT_TYPES[hash % SOCIAL_EVENT_TYPES.length],
    active
  };
}

function resolveDisruptionTrigger({
  rainfall = 0,
  temperature = 0,
  aqi = 0,
  thresholds = {},
  socialEvent = null
} = {}) {
  const rainValue = toNumber(rainfall, 0);
  const temperatureValue = toNumber(temperature, 0);
  const aqiValue = toNumber(aqi, 0);

  const rainfallThreshold = toNumber(
    thresholds.rainfall_threshold ?? thresholds.rain_threshold ?? thresholds.threshold ?? thresholds.rainThreshold,
    0
  );
  const heatThreshold = toNumber(thresholds.heat_threshold ?? process.env.TRIGGER_HEAT_THRESHOLD ?? 38, 38);
  const pollutionThreshold = toNumber(thresholds.pollution_threshold ?? process.env.TRIGGER_AQI_THRESHOLD ?? 150, 150);
  const floodThreshold = toNumber(
    thresholds.flood_threshold ?? Math.max(rainfallThreshold > 0 ? rainfallThreshold * 1.5 : 0, rainfallThreshold + 10),
    0
  );

  const matchedTriggers = [];

  if (socialEvent?.active) {
    matchedTriggers.push("social");
  }
  if (floodThreshold > 0 && rainValue > floodThreshold) {
    matchedTriggers.push("flood");
  }
  if (heatThreshold > 0 && temperatureValue >= heatThreshold) {
    matchedTriggers.push("heat");
  }
  if (pollutionThreshold > 0 && aqiValue > pollutionThreshold) {
    matchedTriggers.push("pollution");
  }
  if (rainfallThreshold > 0 && rainValue > rainfallThreshold) {
    matchedTriggers.push("rain");
  }

  const triggerType = matchedTriggers[0] || null;

  return {
    triggerType,
    trigger_type: triggerType,
    matchedTriggers,
    metrics: {
      rainfall: rainValue,
      temperature: temperatureValue,
      aqi: aqiValue
    },
    thresholds: {
      rainfall_threshold: rainfallThreshold,
      heat_threshold: heatThreshold,
      pollution_threshold: pollutionThreshold,
      flood_threshold: floodThreshold
    },
    socialEvent
  };
}

module.exports = {
  buildMockSocialEvent,
  normalizeTriggerType,
  resolveDisruptionTrigger,
  toNumber
};