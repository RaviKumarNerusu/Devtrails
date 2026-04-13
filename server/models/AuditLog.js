const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { timestamps: false }
);

auditLogSchema.index({ action: 1, timestamp: -1 });

auditLogSchema.index({ user_id: 1, timestamp: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
