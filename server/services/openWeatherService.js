const axios = require("axios");
const weatherCache = require("../utils/weatherCache");
const logger = require("../utils/logger");

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


