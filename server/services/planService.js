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

function normalizeValidTill(validTill) {
  if (!validTill) return null;
  const date = new Date(validTill);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function activatePlanForUser({ userId, name, validTill, session = null }) {
  if (!userId) {
    const error = new Error("Not authorized");
    error.statusCode = 401;
    throw error;
  }

  if (!name || typeof name !== "string") {
    const error = new Error("Plan name is required");
    error.statusCode = 400;
    throw error;
  }

  const validDate = normalizeValidTill(validTill);
  if (validTill && !validDate) {
    const error = new Error("validTill is required and must be a valid date/timestamp");
    error.statusCode = 400;
    throw error;
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
    { upsert: true, new: true, session }
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
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );

  return { profile, policy, plan, validTill: validDate };
}

module.exports = { activatePlanForUser, normalizePlan };