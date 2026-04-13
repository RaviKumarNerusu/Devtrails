const AuditLog = require("../models/AuditLog");
const logger = require("../utils/logger");

async function logAudit(action, userId, metadata = {}) {
  try {
    await AuditLog.create({
      action,
      user_id: userId || null,
      metadata,
      timestamp: new Date()
    });
  } catch (error) {
    logger.warn("Audit log write failed", {
      action,
      userId: userId ? String(userId) : null,
      error: error.message
    });
  }
}

module.exports = {
  logAudit
};
