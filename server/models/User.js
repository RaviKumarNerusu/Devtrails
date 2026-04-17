const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ["partner", "insurer", "admin"], default: "partner", index: true },
    riskScore: { type: Number, default: 0 },
    risk_score: { type: Number, default: 0 },
    wallet_balance: { type: Number, default: 0 },
    claimHistoryCount: { type: Number, default: 0 },
    safeDays: { type: Number, default: 0 },
    location: { type: String, trim: true, default: "" },
    
    // Fraud prevention fields
    lastClaimDate: { type: Date, default: null }, // Track last claim date (UTC)
    cityLockedDate: { type: Date, default: null }, // Track when city was last changed
    lockedCity: { type: String, trim: true, default: "" }, // City locked for the day
    
    // Weekly claim limit tracking
    weeklyClaimCount: { type: Number, default: 0 },
    weekStartDate: { type: Date, default: null },
    
    // Admin review flag
    requiresAdminReview: { type: Boolean, default: false },
    adminReviewReason: { type: String, trim: true, default: "" },

    thresholds: {
      rain: { type: Number, default: 15 },
      heat: { type: Number, default: 38 },
      aqi: { type: Number, default: 150 },
      flood: { type: Number, default: 30 },
      social: { type: Boolean, default: true }
    },

    enabled_factors: {
      rain: { type: Boolean, default: true },
      heat: { type: Boolean, default: true },
      aqi: { type: Boolean, default: true },
      flood: { type: Boolean, default: true },
      social: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);

