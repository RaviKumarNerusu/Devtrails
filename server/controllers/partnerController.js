const PartnerProfile = require("../models/PartnerProfile");
const Policy = require("../models/Policy");

async function getProfile(req, res, next) {
  try {
    const profile = await PartnerProfile.findOne({ userId: req.user._id }).lean();
    res.json({ profile });
  } catch (err) {
    next(err);
  }
}

async function saveProfile(req, res, next) {
  try {
    const { city, pincode, avgDailyEarning, rainThresholdMm } = req.body || {};

    const update = {
      city: city || "",
      pincode: pincode || "",
      avgDailyEarning: Number(avgDailyEarning) || 0,
      rainThresholdMm: Number(rainThresholdMm) || 15
    };

    const profile = await PartnerProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: update, $setOnInsert: { userId: req.user._id } },
      { upsert: true, new: true }
    );

    if (String(update.city || "").trim()) {
      await Policy.findOneAndUpdate(
        { userId: req.user._id, isActive: true },
        { $set: { location: String(update.city).trim(), lastUpdated: new Date() } }
      );
    }

    res.json({ profile });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, saveProfile };

