/**
 * Rate limiter middleware for claim automation
 * Limits /claim/auto to 5 requests per minute per user (fraud prevention)
 */

const logger = require("../utils/logger");

// Map to track user request counts: { userId: { count, resetTime } }
const userRequestMap = new Map();

const RATE_LIMIT_CONFIG = {
  maxRequests: 5,
  windowMs: 60 * 1000, // 1 minute
  banDurationMs: 5 * 60 * 1000 // Ban for 5 minutes after limit exceeded
};

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of userRequestMap.entries()) {
    if (now > data.resetTime + RATE_LIMIT_CONFIG.banDurationMs) {
      userRequestMap.delete(userId);
    }
  }
}, 60 * 1000); // Cleanup every minute

/**
 * Get current request count for user
 */
function getCurrentCount(userId) {
  const now = Date.now();
  const data = userRequestMap.get(userId);

  if (!data) {
    return { count: 0, resetTime: now };
  }

  // Window has expired, reset counter
  if (now > data.resetTime + RATE_LIMIT_CONFIG.windowMs) {
    const newData = { count: 0, resetTime: now };
    userRequestMap.set(userId, newData);
    return newData;
  }

  return data;
}

/**
 * Rate limiter middleware for claim/auto endpoint
 */
function rateLimiterClaimAuto(req, res, next) {
  if (!req.user?._id) {
    const err = new Error("User not authenticated");
    err.statusCode = 401;
    err.errorCode = "UNAUTHORIZED";
    return next(err);
  }

  const userId = req.user._id.toString();
  const current = getCurrentCount(userId);
  const now = Date.now();

  // Check if user is temporarily banned
  if (current.count >= RATE_LIMIT_CONFIG.maxRequests) {
    const timeSinceBan = now - current.resetTime;
    const isBanned = timeSinceBan < RATE_LIMIT_CONFIG.banDurationMs;

    if (isBanned) {
      const retryAfter = Math.ceil(
        (RATE_LIMIT_CONFIG.banDurationMs - timeSinceBan) / 1000
      );

      logger.fraudCheck(
        req.user._id,
        "RATE_LIMIT_EXCEEDED",
        true,
        `User exceeded 5 requests/min. Retry after ${retryAfter}s`
      );

      const err = new Error(
        `Rate limit exceeded. Maximum 5 requests per minute. Retry after ${retryAfter} seconds.`
      );
      err.statusCode = 429; // Too Many Requests
      err.errorCode = "RATE_LIMIT_EXCEEDED";
      err.retryAfter = retryAfter;
      return next(err);
    }

    // Ban window expired, reset
    current.count = 0;
    current.resetTime = now;
  }

  // Increment counter
  current.count++;
  userRequestMap.set(userId, current);

  // Add rate limit headers
  const remainingRequests = RATE_LIMIT_CONFIG.maxRequests - current.count;
  const resetTime = current.resetTime + RATE_LIMIT_CONFIG.windowMs;

  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_CONFIG.maxRequests);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, remainingRequests));
  res.setHeader("X-RateLimit-Reset", resetTime);

  next();
}

module.exports = rateLimiterClaimAuto;
