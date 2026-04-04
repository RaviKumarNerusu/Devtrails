const mongoose = require("mongoose");

const partnerProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    city: { type: String, trim: true },
    pincode: { type: String, trim: true },
    avgDailyEarning: { type: Number, default: 0 },
    rainThresholdMm: { type: Number, default: 15 },
    planName: { type: String, default: null },
    planStatus: { type: String, enum: ["active", "inactive"], default: "inactive" },
    planValidTill: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PartnerProfile", partnerProfileSchema);

