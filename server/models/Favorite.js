const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    city: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

favoriteSchema.index({ userId: 1, city: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);

