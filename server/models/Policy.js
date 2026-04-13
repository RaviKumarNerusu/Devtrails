const mongoose = require("mongoose");

const policySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    basePremium: { type: Number, default: 100 },
    dynamicPremium: { type: Number, default: 100 },
    weekly_premium: { type: Number, default: 100 },
    riskLevel: { type: String, enum: ["low", "medium", "high"], default: "low" },
    coverageHours: { type: Number, default: 24 },
    location: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Policy", policySchema);

