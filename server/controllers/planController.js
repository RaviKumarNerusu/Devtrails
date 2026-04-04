const PartnerProfile = require("../models/PartnerProfile");
const Policy = require("../models/Policy");

const PLAN_MAP = {
  "lite cover": { key: "lite", premium: 49 },
  "standard cover": { key: "standard", premium: 99 },
  "max cover": { key: "max", premium: 149 },
  lite: { key: "lite", premium: 49 },
  standard: { key: "standard", premium: 99 },
  max: { key: "max", premium: 149 }
};

function normalizePlan(name) {
  const raw = String(name || "").trim().toLowerCase();
  return PLAN_MAP[raw] || PLAN_MAP.standard;
}

async function activatePlan(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401);
      throw new Error("Not authorized");
    }

    const { name, validTill } = req.body || {};

    if (!name || typeof name !== "string") {
      res.status(400);
      throw new Error("Plan name is required");
    }

    const validDate = validTill ? new Date(validTill) : null;
    if (!validDate || Number.isNaN(validDate.getTime())) {
      res.status(400);
      throw new Error("validTill is required and must be a valid date/timestamp");
    }

    const plan = normalizePlan(name);

    const profile = await PartnerProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          planName: plan.key,
          planStatus: "active",
          planValidTill: validDate
        },
        $setOnInsert: { userId }
      },
      { upsert: true, new: true }
    );

    const city = String(profile?.city || "").trim();

    const policy = await Policy.findOneAndUpdate(
      { userId },
      {
        $set: {
          isActive: true,
          basePremium: plan.premium,
          dynamicPremium: plan.premium,
          riskLevel: "low",
          coverageHours: 24,
          location: city,
          lastUpdated: new Date()
        },
        $setOnInsert: { userId }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ profile, policy });
  } catch (err) {
    next(err);
  }
}

module.exports = { activatePlan };

