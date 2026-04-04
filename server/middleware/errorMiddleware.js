const { sendError } = require("../utils/responseHandler");
const logger = require("../utils/logger");

/**
 * Handle 404 Not Found errors
 */
function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Not Found - ${req.originalUrl}`));
}

/**
 * Global error handler with standardized response format
 * eslint-disable-next-line no-unused-vars
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  const message = err.message || "Server error";
  const errorCode = err.errorCode || "INTERNAL_SERVER_ERROR";

  // Log the error with context
  logger.error(message, {
    statusCode,
    errorCode,
    userId: req.user?._id?.toString(),
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: err.stack
  });

  const details = process.env.NODE_ENV === "production" ? undefined : { stack: err.stack };

  // Enhanced error response with errorCode
  return res.status(statusCode).json({
    success: false,
    data: null,
    message,
    errorCode,
    retryAfter: err.retryAfter,
    details
  });
}

module.exports = { notFound, errorHandler };


