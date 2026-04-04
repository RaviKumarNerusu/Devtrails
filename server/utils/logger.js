/**
 * Structured logger utility for claim system
 * Provides consistent logging with contextual information
 */

const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "../../logs");

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_LEVELS = {
  ERROR: "ERROR",
  WARN: "WARN",
  INFO: "INFO",
  DEBUG: "DEBUG"
};

function formatTimestamp() {
  return new Date().toISOString();
}

function formatLogMessage(level, message, context = {}) {
  return JSON.stringify(
    {
      timestamp: formatTimestamp(),
      level,
      message,
      ...context
    },
    null,
    2
  );
}

function logToFile(level, message, context) {
  try {
    const logFile = path.join(LOG_DIR, `claim-system-${new Date().toISOString().split("T")[0]}.log`);
    const logEntry = `[${formatTimestamp()}] [${level}] ${message}\n${JSON.stringify(context, null, 2)}\n---\n`;
    fs.appendFileSync(logFile, logEntry, "utf-8");
  } catch (err) {
    console.error("Failed to write log file:", err.message);
  }
}

const logger = {
  info: (message, context = {}) => {
    const formattedMessage = formatLogMessage(LOG_LEVELS.INFO, message, context);
    console.log(formattedMessage);
    logToFile(LOG_LEVELS.INFO, message, context);
  },

  warn: (message, context = {}) => {
    const formattedMessage = formatLogMessage(LOG_LEVELS.WARN, message, context);
    console.warn(formattedMessage);
    logToFile(LOG_LEVELS.WARN, message, context);
  },

  error: (message, context = {}) => {
    const formattedMessage = formatLogMessage(LOG_LEVELS.ERROR, message, context);
    console.error(formattedMessage);
    logToFile(LOG_LEVELS.ERROR, message, context);
  },

  debug: (message, context = {}) => {
    if (process.env.NODE_ENV === "development") {
      const formattedMessage = formatLogMessage(LOG_LEVELS.DEBUG, message, context);
      console.log(formattedMessage);
      logToFile(LOG_LEVELS.DEBUG, message, context);
    }
  },

  /**
   * Log claim decision with full context
   */
  claimDecision: (userId, city, rainMm, threshold, decision, context = {}) => {
    logger.info("Claim decision made", {
      userId: userId?.toString(),
      city,
      rainMm,
      threshold,
      decision,
      ...context
    });
  },

  /**
   * Log fraud check result
   */
  fraudCheck: (userId, checkType, result, reason = "") => {
    logger.warn(`Fraud check: ${checkType}`, {
      userId: userId?.toString(),
      result,
      reason
    });
  }
};

module.exports = logger;
