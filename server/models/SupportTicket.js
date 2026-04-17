const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["refund", "payout", "bug"], required: true },
    message: { type: String, required: true, trim: true, minlength: 5 },
    status: { type: String, enum: ["pending", "resolved"], default: "pending", index: true },
    rating: { type: Number, min: 1, max: 5 },
    adminReply: { type: String, trim: true, default: "" },
    adminReplyAt: { type: Date, default: null },
    adminReplyBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", supportTicketSchema);

