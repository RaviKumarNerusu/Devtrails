/**
 * In-memory weather cache with TTL (Time-To-Live)
 * Cache weather data per city for 10 minutes to reduce API calls
 */

const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

class WeatherCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get cached weather data
   * @param {string} city - City name
   * @returns {object|null} - Cached weather data or null if expired
   */
  get(city) {
    const normalizedCity = String(city || "").toLowerCase().trim();
    const cached = this.cache.get(normalizedCity);

    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > CACHE_DURATION_MS;
    if (isExpired) {
      this.cache.delete(normalizedCity);
      return null;
    }

    return cached.data;
  }

  /**
   * Set weather data in cache
   * @param {string} city - City name
   * @param {object} data - Weather data
   */
  set(city, data) {
    if (!city || !data) return;
    const normalizedCity = String(city).toLowerCase().trim();
    this.cache.set(normalizedCity, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear specific city cache
   */
  clear(city) {
    const normalizedCity = String(city).toLowerCase().trim();
    this.cache.delete(normalizedCity);
  }

  /**
   * Clear all cache
   */
  clearAll() {
    this.cache.clear();
  }

  /**
   * Get cache size (for monitoring)
   */
  size() {
    return this.cache.size;
  }
}

module.exports = new WeatherCache();
