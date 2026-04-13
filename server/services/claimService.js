const Claim = require("../models/Claim");
const Policy = require("../models/Policy");
const User = require("../models/User");
const PartnerProfile = require("../models/PartnerProfile");
const { fetchCurrentWeather } = require("./openWeatherService");
const { getRiskScore } = require("./mlService");
const { getFraudScore } = require("./fraudService");
const { calculatePremium } = require("../utils/premiumCalculator");
const { simulateClaimPayout } = require("./payoutService");
const {
  extractRainSafely,
  getLocalDateOnly,
  validateUserProfile,
  validateWeatherData
} = require("../utils/claimValidator");
const { executeInTransaction } = require("../utils/transactionHelper");
const logger = require("../utils/logger");

const TERMINAL_STATUSES = new Set(["claimed", "approved", "rejected"]);
const CLAIMED_FLOW_STATUSES = new Set(["eligible", "claimed", "approved"]);

function normalizeStatus(value) {
  const status = String(value || "").toLowerCase();
  return ["not_eligible", "eligible", "claimed", "approved", "rejected"].includes(status)
    ? status
    : "not_eligible";
}

function buildAuditEntry(action, details) {
  return {
    action,
    timestamp: new Date(),
    details
  };
}

function isClaimEligibleStatus(status) {
  return CLAIMED_FLOW_STATUSES.has(normalizeStatus(status));
}

function inferLocationRisk(city) {
  const value = String(city || "").toLowerCase();
  const highRisk = ["industrial", "flood", "coastal", "lowland", "high-risk", "high_risk_area", "flood_zone"];
  return highRisk.some((item) => value.includes(item)) ? 0.8 : 0.2;
}

async function collapseDuplicateDailyClaims(userId, claimDate) {
  const records = await Claim.find({ userId, date: claimDate }).sort({ createdAt: 1 });
  if (records.length <= 1) {
    return records[0] || null;
  }

  const winner = records.reduce((best, current) => {
    if (!best) return current;

    const bestTerminal = TERMINAL_STATUSES.has(normalizeStatus(best.status));
    const currentTerminal = TERMINAL_STATUSES.has(normalizeStatus(current.status));

    if (bestTerminal && !currentTerminal) return best;
    if (!bestTerminal && currentTerminal) return current;
    if (current.updatedAt > best.updatedAt) return current;
    return best;
  }, null);

  const duplicates = records.filter((record) => String(record._id) !== String(winner._id));
  if (duplicates.length > 0) {
    await Claim.deleteMany({ _id: { $in: duplicates.map((item) => item._id) } });
  }

  return winner;
}

async function getActivePolicyOrThrow(userId, profile) {
  const activePolicy = await Policy.findOne({ userId, isActive: true }).sort({ createdAt: -1 });
  if (activePolicy) {
    if (profile?.city && activePolicy.location !== profile.city) {
      activePolicy.location = profile.city;
      activePolicy.lastUpdated = new Date();
      await activePolicy.save();
    }
    return activePolicy;
  }

  const err = new Error("No active policy. Select a plan first.");
  err.statusCode = 400;
  err.errorCode = "NO_ACTIVE_POLICY";
  throw err;
}

async function upsertDailyClaimRecord({
  userId,
  city,
  rainMm,
  threshold,
  riskLevel,
  eligible,
  amount,
  payoutAmount,
  maxPayoutAmount,
  autoTriggered = true,
  triggerType = "weather",
  riskScore = 0,
  fraudScore = 0,
  forceStatus = null
}) {
  const claimDate = getLocalDateOnly();
  let nextStatus = forceStatus || (eligible ? "eligible" : "not_eligible");
  const existingClaim = await Claim.findOne({ userId, date: claimDate });

  // Preserve eligibility once reached for the day unless an explicit forceStatus is provided.
  if (!forceStatus && existingClaim && normalizeStatus(existingClaim.status) === "eligible" && nextStatus === "not_eligible") {
    nextStatus = "eligible";
  }

  if (existingClaim && TERMINAL_STATUSES.has(normalizeStatus(existingClaim.status))) {
    return existingClaim;
  }

  const auditEntry = buildAuditEntry(eligible ? "ELIGIBILITY_DETECTED" : "ELIGIBILITY_NOT_MET", {
    city,
    rainMm,
    threshold,
    eligible,
    status: nextStatus
  });

  const claimUpdate = {
    city,
    rainMm,
    threshold,
    riskLevel,
    amount: Number.isFinite(Number(amount)) ? Number(amount) : 0,
    payoutAmount: Number.isFinite(Number(payoutAmount)) ? Number(payoutAmount) : 0,
    maxPayoutAmount: Number.isFinite(Number(maxPayoutAmount)) ? Number(maxPayoutAmount) : 0,
    autoTriggered,
    triggerType,
    trigger_type: triggerType,
    risk_score: Number.isFinite(Number(riskScore)) ? Number(riskScore) : 0,
    fraud_score: Number.isFinite(Number(fraudScore)) ? Number(fraudScore) : 0,
    status: nextStatus
  };

  if (!existingClaim) {
    try {
      const created = await Claim.create({
        userId,
        city,
        date: claimDate,
        rainMm,
        threshold,
        riskLevel,
        amount: Number.isFinite(Number(amount)) ? Number(amount) : 0,
        payoutAmount: Number.isFinite(Number(payoutAmount)) ? Number(payoutAmount) : 0,
        maxPayoutAmount: Number.isFinite(Number(maxPayoutAmount)) ? Number(maxPayoutAmount) : 0,
        autoTriggered,
        triggerType,
        trigger_type: triggerType,
        risk_score: Number.isFinite(Number(riskScore)) ? Number(riskScore) : 0,
        fraud_score: Number.isFinite(Number(fraudScore)) ? Number(fraudScore) : 0,
        status: nextStatus,
        auditLogs: [auditEntry]
      });
      const winner = await collapseDuplicateDailyClaims(userId, claimDate);
      return winner || created;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }

  try {
    const updated = await Claim.findOneAndUpdate(
      {
        userId,
        date: claimDate,
        status: { $nin: Array.from(TERMINAL_STATUSES) }
      },
      {
        $set: claimUpdate,
        $push: { auditLogs: auditEntry }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const winner = await collapseDuplicateDailyClaims(userId, claimDate);
    return winner || updated;
  } catch (error) {
    if (error?.code === 11000) {
      return Claim.findOne({ userId, date: claimDate });
    }
    throw error;
  }
}

async function evaluateClaimEligibility(user) {
  const profile = await PartnerProfile.findOne({ userId: user._id }).lean();
  const city = validateUserProfile(user, profile);
  const policy = await getActivePolicyOrThrow(user._id, profile);

  const threshold = Number(profile?.rainThresholdMm || 15);

  const currentWeather = await fetchCurrentWeather(city);
  const rainMm = extractRainSafely(currentWeather, 1);
  validateWeatherData(rainMm, threshold);
  const eligible = rainMm >= threshold;

  const pastClaims = await Claim.countDocuments({ userId: user._id });
  const mlInput = {
    temperature: Number(currentWeather?.main?.temp ?? 0) || 0,
    rainfall: rainMm,
    aqi: Number(currentWeather?.main?.aqi ?? currentWeather?.aqi ?? 50) || 50,
    past_claims: pastClaims,
    location_risk: inferLocationRisk(city)
  };
  const riskScore = await getRiskScore(mlInput);
  const fraudResult = await getFraudScore({
    userId: user._id,
    rainMm,
    threshold,
    triggeredByWeather: eligible,
    isAutoTriggered: true
  });
  const weeklyPremium = calculatePremium(riskScore);

  await Promise.all([
    User.findByIdAndUpdate(user._id, { $set: { riskScore: riskScore, risk_score: riskScore } }),
    Policy.updateOne({ userId: user._id, isActive: true }, { $set: { weekly_premium: weeklyPremium } })
  ]);

  const forceStatus = fraudResult.should_reject ? "rejected" : null;
  const claim = await upsertDailyClaimRecord({
    userId: user._id,
    city,
    rainMm,
    threshold,
    riskLevel: eligible ? "HIGH" : "LOW",
    eligible,
    amount: 0,
    payoutAmount: 0,
    maxPayoutAmount: 0,
    autoTriggered: true,
    triggerType: "weather",
    riskScore,
    fraudScore: fraudResult.fraud_score,
    forceStatus
  });

  logger.info("Claim eligibility evaluated", {
    userId: user._id.toString(),
    city,
    rain: rainMm,
    threshold,
    decision: eligible ? "ELIGIBLE" : "NOT_ELIGIBLE",
    status: claim?.status || "none"
  });

  return {
    policy,
    city,
    rainMm,
    threshold,
    riskScore,
    fraudScore: fraudResult.fraud_score,
    weeklyPremium,
    eligible,
    status: claim?.status || (eligible ? "eligible" : "not_eligible"),
    claim
  };
}

async function approveAndPayoutClaim(userId, claim) {
  if (!claim || claim.status !== "eligible") {
    return claim;
  }

  const approvedAt = new Date();
  const approvedClaim = await Claim.findByIdAndUpdate(
    claim._id,
    {
      $set: {
        status: "approved",
        approvedAt
      },
      $push: {
        auditLogs: buildAuditEntry("CLAIM_AUTO_APPROVED", {
          approvedAt,
          source: "trigger-engine"
        })
      }
    },
    { new: true }
  );

  await simulateClaimPayout({
    claimId: approvedClaim._id,
    userId,
    payoutAmount: approvedClaim.payoutAmount
  });

  return approvedClaim;
}

async function redeemEligibleClaim(user, claimId = null) {
  const profile = await PartnerProfile.findOne({ userId: user._id }).lean().catch(() => null);
  if (profile?.city) {
    await getActivePolicyOrThrow(user._id, profile);
  }

  const query = {
    userId: user._id,
    status: "eligible"
  };

  if (claimId) {
    query._id = claimId;
  }

  const approvedClaim = await executeInTransaction(async (session) => {
    const claimedAt = new Date();
    const claim = await Claim.findOneAndUpdate(
      query,
      {
        $set: {
          status: "claimed",
          claimedAt
        },
        $push: {
          auditLogs: buildAuditEntry("CLAIM_REDEEMED", {
            claimId,
            claimedAt
          })
        }
      },
      {
        new: true,
        sort: { date: -1, createdAt: -1 },
        session
      }
    );

    if (!claim) {
      const err = new Error(claimId ? "Claim is not eligible for redemption." : "No eligible claim found to redeem.");
      err.statusCode = 404;
      err.errorCode = claimId ? "CLAIM_NOT_REDEEMABLE" : "NO_ELIGIBLE_CLAIM";
      throw err;
    }

    const approvedAt = new Date();
    const approvedClaim = await Claim.findByIdAndUpdate(
      claim._id,
      {
        $set: {
          status: "approved",
          approvedAt
        },
        $push: {
          auditLogs: buildAuditEntry("CLAIM_APPROVED", {
            approvedAt
          })
        }
      },
      { new: true, session }
    );

    await simulateClaimPayout({
      claimId: approvedClaim._id,
      userId: user._id,
      payoutAmount: approvedClaim.payoutAmount,
      session
    });

    return approvedClaim;
  });

  logger.info("Claim redeemed and approved", {
    userId: user._id.toString(),
    rain: approvedClaim.rainMm,
    threshold: approvedClaim.threshold,
    decision: "REDEEMED",
    status: approvedClaim.status
  });

  return approvedClaim;
}

async function createAutoTriggeredClaim(user, triggerType = "weather") {
  const result = await evaluateClaimEligibility(user);
  if (!result?.claim) {
    return result;
  }

  if (result.claim.status === "eligible") {
    result.claim = await approveAndPayoutClaim(user._id, result.claim);
    result.status = result.claim.status;
  }

  if (result.claim.status === "approved") {
    result.eligible = true;
  }

  if (triggerType && result.claim.trigger_type !== triggerType) {
    result.claim = await Claim.findByIdAndUpdate(
      result.claim._id,
      { $set: { triggerType, trigger_type: triggerType } },
      { new: true }
    );
  }

  return result;
}

async function listClaimsForUser(userId) {
  return Claim.find({ userId }).sort({ date: -1, createdAt: -1 }).lean();
}

async function listClaimsForInsurer({ page = 1, limit = 20, userId, status, from, to }) {
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));

  const query = {};
  if (userId) {
    query.userId = userId;
  }

  const normalized = normalizeStatus(status);
  if (status && normalized === status) {
    query.status = normalized;
  }

  if (from || to) {
    query.date = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        query.date.$gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        query.date.$lte = toDate;
      }
    }
    if (!query.date.$gte && !query.date.$lte) {
      delete query.date;
    }
  }

  const [claims, total] = await Promise.all([
    Claim.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .populate("userId", "name email")
      .lean(),
    Claim.countDocuments(query)
  ]);

  return {
    claims,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

module.exports = {
  isClaimEligibleStatus,
  getActivePolicyOrThrow,
  upsertDailyClaimRecord,
  evaluateClaimEligibility,
  createAutoTriggeredClaim,
  redeemEligibleClaim,
  listClaimsForUser,
  listClaimsForInsurer
};
