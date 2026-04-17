const axios = require("axios");
const weatherCache = require("../utils/weatherCache");
const logger = require("../utils/logger");

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function isMysoreDemoEnabled() {
  if (typeof process.env.MYSORE_DEMO_WEATHER === "undefined") {
    return true;
  }
  return isTruthy(process.env.MYSORE_DEMO_WEATHER);
}

function isMysoreCity(city) {
  const normalized = String(city || "").trim().toLowerCase();
  return normalized.includes("mysore") || normalized.includes("mysuru");
}

function shouldUseMysoreDemoWeather(city) {
  return isMysoreDemoEnabled() && isMysoreCity(city);
}

function formatForecastDateTime(timestampMs) {
  const iso = new Date(timestampMs).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function buildMysoreDemoCurrentWeather(requestedCity) {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  return {
    coord: { lat: 12.2958, lon: 76.6394 },
    weather: [
      {
        id: 502,
        main: "Rain",
        description: "heavy intensity rain",
        icon: "10d"
      }
    ],
    base: "demo",
    main: {
      temp: 26,
      feels_like: 28,
      temp_min: 25,
      temp_max: 27,
      pressure: 1008,
      humidity: 88,
      aqi: 85
    },
    visibility: 4500,
    wind: {
      speed: 5.1,
      deg: 210
    },
    clouds: { all: 96 },
    rain: { "1h": 24, "3h": 48 },
    dt: nowSec,
    sys: {
      country: "IN",
      sunrise: Math.floor((now - 3 * 60 * 60 * 1000) / 1000),
      sunset: Math.floor((now + 4 * 60 * 60 * 1000) / 1000)
    },
    timezone: 19800,
    id: 1262321,
    name: String(requestedCity || "Mysore").trim() || "Mysore",
    cod: 200,
    source: "demo"
  };
}

function buildMysoreDemoForecast(requestedCity) {
  const now = Date.now();
  const list = [];

  for (let index = 0; index < 40; index += 1) {
    const ts = now + index * 3 * 60 * 60 * 1000;
    const rainfallPattern = [22, 18, 12, 8, 16, 20, 10, 6];
    const tempPattern = [26, 27, 28, 29, 28, 27, 26, 25];
    const humidityPattern = [90, 88, 85, 82, 86, 89, 91, 92];
    const patternIndex = index % rainfallPattern.length;

    list.push({
      dt: Math.floor(ts / 1000),
      main: {
        temp: tempPattern[patternIndex],
        feels_like: tempPattern[patternIndex] + 1,
        humidity: humidityPattern[patternIndex],
        pressure: 1008
      },
      weather: [
        {
          id: 501,
          main: "Rain",
          description: "moderate rain",
          icon: "10d"
        }
      ],
      clouds: { all: 90 },
      wind: { speed: 4.2 },
      rain: { "3h": rainfallPattern[patternIndex] },
      dt_txt: formatForecastDateTime(ts)
    });
  }

  return {
    cod: "200",
    message: 0,
    cnt: list.length,
    list,
    city: {
      id: 1262321,
      name: String(requestedCity || "Mysore").trim() || "Mysore",
      country: "IN",
      timezone: 19800,
      coord: {
        lat: 12.2958,
        lon: 76.6394
      }
    },
    source: "demo"
  };
}

function getApiKey() {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error("OPENWEATHER_API_KEY is missing. Set it in environment variables.");
  return key;
}

/**
 * Fetch current weather with caching and resilience
 * Logs all attempts and failures
 */
async function fetchCurrentWeather(city) {
  if (!city) {
    const err = new Error("City parameter is required");
    err.statusCode = 400;
    err.errorCode = "CITY_REQUIRED";
    throw err;
  }

  const normalizedCity = String(city).trim();

  if (shouldUseMysoreDemoWeather(normalizedCity)) {
    logger.info("Using Mysore demo current weather override", { city: normalizedCity });
    return buildMysoreDemoCurrentWeather(normalizedCity);
  }

  // Check cache first
  const cached = weatherCache.get(normalizedCity);
  if (cached) {
    logger.debug("Weather cache hit", {
      city: normalizedCity,
      cached: true
    });
    return cached;
  }

  const apiKey = getApiKey();
  const url = "https://api.openweathermap.org/data/2.5/weather";

  try {
    logger.debug("Fetching current weather from API", { city: normalizedCity });

    const { data } = await axios.get(url, {
      params: { q: normalizedCity, appid: apiKey, units: "metric" },
      timeout: 8000
    });

    // Validate response
    if (!data || !data.main) {
      throw new Error("Invalid response structure from weather API");
    }

    // Cache successful response
    weatherCache.set(normalizedCity, data);

    logger.info("Current weather fetched successfully", {
      city: normalizedCity,
      temp: data.main?.temp,
      condition: data.weather?.[0]?.main
    });

    return data;
  } catch (err) {
    // Distinguish between different error types
    let statusCode = 500;
    let errorCode = "WEATHER_API_ERROR";
    let message = `Failed to fetch current weather for "${normalizedCity}"`;

    if (err.response?.status === 404) {
      statusCode = 404;
      errorCode = "CITY_NOT_FOUND";
      message = `City "${normalizedCity}" not found`;
    } else if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      statusCode = 503;
      errorCode = "WEATHER_API_TIMEOUT";
      message = `Weather API timeout for "${normalizedCity}"`;
    } else if (err.response?.status === 401) {
      statusCode = 500;
      errorCode = "INVALID_API_KEY";
      message = "Weather API key is invalid";
    }

    const apiError = new Error(message);
    apiError.statusCode = statusCode;
    apiError.errorCode = errorCode;
    apiError.originalError = err.message;

    logger.error(message, {
      city: normalizedCity,
      errorCode,
      details: err.message
    });

    throw apiError;
  }
}

/**
 * Fetch 5-day forecast with caching and resilience
 */
async function fetchFiveDayForecast(city) {
  if (!city) {
    const err = new Error("City parameter is required");
    err.statusCode = 400;
    err.errorCode = "CITY_REQUIRED";
    throw err;
  }

  const normalizedCity = String(city).trim();

  if (shouldUseMysoreDemoWeather(normalizedCity)) {
    logger.info("Using Mysore demo forecast override", { city: normalizedCity });
    return buildMysoreDemoForecast(normalizedCity);
  }

  // Check cache (same cache key as current weather)
  const cached = weatherCache.get(normalizedCity + "_forecast");
  if (cached) {
    logger.debug("Forecast cache hit", {
      city: normalizedCity,
      cached: true
    });
    return cached;
  }

  const apiKey = getApiKey();
  const url = "https://api.openweathermap.org/data/2.5/forecast";

  try {
    logger.debug("Fetching 5-day forecast from API", { city: normalizedCity });

    const { data } = await axios.get(url, {
      params: { q: normalizedCity, appid: apiKey, units: "metric" },
      timeout: 8000
    });

    // Validate response
    if (!data || !Array.isArray(data.list)) {
      throw new Error("Invalid response structure from forecast API");
    }

    // Cache successful response
    weatherCache.set(normalizedCity + "_forecast", data);

    logger.info("5-day forecast fetched successfully", {
      city: normalizedCity,
      forecastItems: data.list?.length
    });

    return data;
  } catch (err) {
    // Distinguish between different error types
    let statusCode = 500;
    let errorCode = "FORECAST_API_ERROR";
    let message = `Failed to fetch 5-day forecast for "${normalizedCity}"`;

    if (err.response?.status === 404) {
      statusCode = 404;
      errorCode = "CITY_NOT_FOUND";
      message = `City "${normalizedCity}" not found`;
    } else if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      statusCode = 503;
      errorCode = "FORECAST_API_TIMEOUT";
      message = `Forecast API timeout for "${normalizedCity}"`;
    } else if (err.response?.status === 401) {
      statusCode = 500;
      errorCode = "INVALID_API_KEY";
      message = "Forecast API key is invalid";
    }

    const apiError = new Error(message);
    apiError.statusCode = statusCode;
    apiError.errorCode = errorCode;
    apiError.originalError = err.message;

    logger.error(message, {
      city: normalizedCity,
      errorCode,
      details: err.message
    });

    throw apiError;
  }
}

module.exports = { fetchCurrentWeather, fetchFiveDayForecast };


