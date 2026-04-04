const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ["partner", "insurer", "admin"], default: "partner", index: true },
    riskScore: { type: Number, default: 0 },
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
    adminReviewReason: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);

