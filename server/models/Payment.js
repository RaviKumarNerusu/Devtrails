const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    planId: { type: String, enum: ["lite", "standard", "max"], required: true, index: true },
    planName: { type: String, required: true, trim: true },
    gateway: { type: String, default: "razorpay" },
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, default: null, index: true },
    signature: { type: String, default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["created", "verified", "activated", "failed"],
      default: "created",
      index: true
    },
    verifiedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    notes: { type: mongoose.Schema.Types.Mixed, default: {} },
    gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);