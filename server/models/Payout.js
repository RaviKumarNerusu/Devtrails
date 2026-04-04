const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true, index: true },
    city: { type: String, trim: true },
    rainMm: { type: Number, required: true },
    threshold: { type: Number, required: true },
    avgEarning: { type: Number, required: true },
    riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "SEVERE", "UNKNOWN"], default: "UNKNOWN" },
    payoutAmount: { type: Number, required: true },
    status: { type: String, enum: ["not triggered", "approved", "paid"], default: "not triggered" },
    reason: { type: String }
  },
  { timestamps: true }
);

payoutSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Payout", payoutSchema);

