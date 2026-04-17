const mongoose = require("mongoose");

function toLocalDateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const claimSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    city: { type: String, trim: true, required: true },
    date: {
      type: Date,
      required: true,
      index: true,
      default: () => toLocalDateOnly(),
      set: (value) => toLocalDateOnly(value)
    },
    rainMm: { type: Number, default: 0, min: 0 },
    threshold: { type: Number, default: 15, min: 0 },
    riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "SEVERE", "UNKNOWN"], default: "UNKNOWN" },
    amount: { type: Number, default: 0, min: 0 },
    payoutAmount: { type: Number, default: 0, min: 0 },
    maxPayoutAmount: { type: Number, default: 0, min: 0 }, // Capped payout
    autoTriggered: { type: Boolean, default: true },
    triggerType: { type: String, enum: ["weather", "time", "location", "event", "rain", "heat", "pollution", "flood", "social"], default: "rain" },
    trigger_type: { type: mongoose.Schema.Types.Mixed, default: "rain" },
    trigger_types: {
      type: [String],
      enum: ["rain", "heat", "pollution", "flood", "social"],
      default: []
    },
    factor_observations: { type: mongoose.Schema.Types.Mixed, default: {} },
    risk_score: { type: Number, default: 0, min: 0, max: 1 },
    fraud_score: { type: Number, default: 0, min: 0, max: 1 },
    fraud_reason: { type: String, trim: true, default: "" },
    ml_factors: { type: mongoose.Schema.Types.Mixed, default: {} },
    model_version: { type: String, default: "v1.0" },
    threshold_used: { type: mongoose.Schema.Types.Mixed, default: null },
    confidence_score: { type: Number, default: 0, min: 0, max: 1 },
    decision_reason: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["not_eligible", "eligible", "pending_approval", "approved", "rejected", "paid", "claimed"],
      default: "not_eligible"
    },
    claimedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    
    // Admin review fields
    requiresAdminReview: { type: Boolean, default: false },
    adminReviewReason: { type: String, trim: true, default: "" },
    adminReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    adminReviewedAt: { type: Date, default: null },
    adminDecision: { type: String, enum: ["approved", "rejected", null], default: null },
    
    // Audit trail
    auditLogs: [
      {
        action: String,
        timestamp: { type: Date, default: Date.now },
        details: mongoose.Schema.Types.Mixed
      }
    ]
  },
  { timestamps: true }
);

// Compound index for user + date (prevents duplicate same-day claims)
claimSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Claim", claimSchema);

