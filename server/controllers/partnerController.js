const PartnerProfile = require("../models/PartnerProfile");
const Policy = require("../models/Policy");

const FACTOR_OPTIONS = ["rain", "heat", "pollution", "flood", "social"];

function normalizeEnabledFactors(input) {
  if (!Array.isArray(input)) return FACTOR_OPTIONS;
  const deduped = [...new Set(input.map((item) => String(item || "").trim().toLowerCase()))]
    .filter((item) => FACTOR_OPTIONS.includes(item));
  return deduped.length > 0 ? deduped : FACTOR_OPTIONS;
}

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
    const { city, pincode, avgDailyEarning, rainThresholdMm, enabledFactors } = req.body || {};

    const update = {
      city: city || "",
      pincode: pincode || "",
      avgDailyEarning: Number(avgDailyEarning) || 0,
      rainThresholdMm: Number(rainThresholdMm) || 15,
      enabledFactors: normalizeEnabledFactors(enabledFactors)
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

