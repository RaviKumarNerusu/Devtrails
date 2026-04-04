/**
 * Validation utilities for claim automation system
 * Ensures all inputs meet production-grade requirements
 */

/**
 * Get the local day boundary used for claim deduplication.
 */
function getLocalDateOnly(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Validate user has required profile and city
 */
function validateUserProfile(user, profile) {
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 401;
    err.errorCode = "USER_NOT_FOUND";
    throw err;
  }

  if (!profile || !String(profile.city || "").trim()) {
    const err = new Error("Profile incomplete");
    err.statusCode = 400;
    err.errorCode = "PARTNER_PROFILE_INCOMPLETE";
    throw err;
  }

  return String(profile.city).trim();
}

/**
 * Validate weather data
 */
function validateWeatherData(rainfall, threshold) {
  const rain = Number(rainfall);
  const thresh = Number(threshold);

  // Rainfall must be >= 0
  if (!Number.isFinite(rain) || rain < 0) {
    const err = new Error("Invalid rainfall data: expected non-negative number");
    err.statusCode = 400;
    err.errorCode = "INVALID_RAINFALL";
    throw err;
  }

  // Threshold must be > 0
  if (!Number.isFinite(thresh) || thresh <= 0) {
    const err = new Error("Invalid threshold: expected positive number");
    err.statusCode = 400;
    err.errorCode = "INVALID_THRESHOLD";
    throw err;
  }

  return { rainfall: rain, threshold: thresh };
}

/**
 * Extract rain safely from weather object
 */
function extractRainSafely(currentWeather, fallbackRain = 1) {
  // Try primary sources: 1h rain, then 3h rain
  const rain1h = currentWeather?.rain?.["1h"];
  const rain3h = currentWeather?.rain?.["3h"];

  const rain = Number(rain1h) || Number(rain3h) || 0;

  // If weather condition is "Rain" but no numeric rain data, assume small rain
  const weatherCondition = String(currentWeather?.weather?.[0]?.main || "").toLowerCase();
  if (weatherCondition === "rain" && rain === 0) {
    return Number(fallbackRain);
  }

  return Math.max(0, rain);
}

/**
 * Validate daily claim eligibility (fraud prevention)
 */
function validateDailyClaimLimit(lastClaimDate, maxClaimsPerDay = 1) {
  if (!lastClaimDate) return true; // No previous claim

  const today = getLocalDateOnly();
  const lastClaimDay = getLocalDateOnly(new Date(lastClaimDate));

  // Same day = duplicate attempt
  if (lastClaimDay.getTime() === today.getTime()) {
    const err = new Error("Maximum 1 claim allowed per day");
    err.statusCode = 429;
    err.errorCode = "DAILY_LIMIT_EXCEEDED";
    throw err;
  }

  return true;
}

/**
 * Validate city hasn't been changed within same day (fraud prevention)
 */
function validateCityLock(cityLockedDate, currentCity, lockedCity) {
  if (!cityLockedDate || !lockedCity) return true; // No previous lock

  const today = getLocalDateOnly();
  const lockedDay = getLocalDateOnly(new Date(cityLockedDate));

  if (lockedDay.getTime() === today.getTime() && currentCity !== lockedCity) {
    const err = new Error("City cannot be changed within same day");
    err.statusCode = 400;
    err.errorCode = "CITY_LOCKED_TODAY";
    throw err;
  }

  return true;
}

module.exports = {
  validateUserProfile,
  validateWeatherData,
  extractRainSafely,
  getLocalDateOnly,
  validateDailyClaimLimit,
  validateCityLock
};
