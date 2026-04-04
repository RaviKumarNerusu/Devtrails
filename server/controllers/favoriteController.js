const Favorite = require("../models/Favorite");

async function addFavorite(req, res, next) {
  try {
    const { city } = req.body || {};
    const normalized = String(city || "").trim();
    if (!normalized) {
      res.status(400);
      throw new Error("city is required");
    }

    const fav = await Favorite.create({ userId: req.user._id, city: normalized });
    res.status(201).json({ favorite: fav });
  } catch (err) {
    // duplicate favorite
    if (err?.code === 11000) {
      res.status(409);
      return next(new Error("City already in favorites"));
    }
    next(err);
  }
}

async function listFavorites(req, res, next) {
  try {
    const items = await Favorite.find({ userId: req.user._id }).sort({ createdAt: -1 }).select("city createdAt");
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

module.exports = { addFavorite, listFavorites };

