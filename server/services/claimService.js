const Claim = require("../models/Claim");
const Policy = require("../models/Policy");
const User = require("../models/User");
const PartnerProfile = require("../models/PartnerProfile");
const { fetchCurrentWeather } = require("./openWeatherService");
const { getRiskScore } = require("./mlService");
const { getFraudScore } = require("./fraudService");
const { calculatePremium } = require("../utils/premiumCalculator");
const { calculatePayout } = require("./payoutService");
const { logAudit } = require("./auditLogService");
const { normalizeTriggerType, toNumber, resolveDisruptionTrigger } = require("../utils/disruptionRules");
const {
  extractRainSafely,
  getLocalDateOnly,
  validateUserProfile,
  validateWeatherData
} = require("../utils/claimValidator");
const { executeInTransaction } = require("../utils/transactionHelper");
const logger = require("../utils/logger");

const TERMINAL_STATUSES = new Set(["pending_approval", "approved", "rejected", "paid", "claimed"]);
const CLAIMED_FLOW_STATUSES = new Set(["eligible", "pending_approval", "approved", "paid", "claimed"]);
const SUPPORTED_FACTORS = new Set(["rain", "heat", "pollution", "flood", "social"]);
const FACTOR_WEIGHTS = {
  rain: 0.4,
  heat: 0.3,
  pollution: 0.2,
  flood: 0.6,
  social: 0.5
};
const DEFAULT_THRESHOLDS = {
  rain: 15,
  heat: 38,
  aqi: 150,
  flood: 30,
  social: true
};
const DEFAULT_ENABLED_FACTORS = {
  rain: true,
  heat: true,
  aqi: true,
  flood: true,
  social: true
};

function normalizeStatus(value) {
  const status = String(value || "").toLowerCase();
  if (status === "pending") return "pending_approval";
  return ["not_eligible", "eligible", "pending_approval", "approved", "rejected", "paid", "claimed"].includes(status)
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

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function normalizeFactorName(value) {
  const raw = String(value || "rain").trim().toLowerCase();
  if (raw === "aqi") return "pollution";
  if (raw === "weather") return "rain";
  if (raw === "event") return "social";
  return normalizeTriggerType(raw);
}

function normalizeTriggerList(value) {
  const list = Array.isArray(value) ? value : [value];
  const normalized = [...new Set(list.map((item) => normalizeFactorName(item)).filter((item) => SUPPORTED_FACTORS.has(item)))];
  return normalized;
}

function normalizeThresholdConfig({ userThresholds = {}, profile = {}, thresholdUsed = {}, dynamicRain = null } = {}) {
  const fallbackRain = Number.isFinite(Number(dynamicRain)) ? Number(dynamicRain) : Number(profile?.rainThresholdMm || DEFAULT_THRESHOLDS.rain);
  return {
    rain: toNumber(userThresholds?.rain ?? thresholdUsed?.rainfall_threshold ?? thresholdUsed?.threshold ?? fallbackRain, DEFAULT_THRESHOLDS.rain),
    heat: toNumber(userThresholds?.heat ?? thresholdUsed?.heat_threshold ?? DEFAULT_THRESHOLDS.heat, DEFAULT_THRESHOLDS.heat),
    aqi: toNumber(userThresholds?.aqi ?? thresholdUsed?.pollution_threshold ?? DEFAULT_THRESHOLDS.aqi, DEFAULT_THRESHOLDS.aqi),
    flood: toNumber(
      userThresholds?.flood ??
        thresholdUsed?.flood_threshold ??
        Math.max((thresholdUsed?.rainfall_threshold ?? fallbackRain) * 1.5, (thresholdUsed?.rainfall_threshold ?? fallbackRain) + 10),
      DEFAULT_THRESHOLDS.flood
    ),
    social: typeof userThresholds?.social === "boolean" ? userThresholds.social : DEFAULT_THRESHOLDS.social
  };
}

function normalizeEnabledFactorMap(userEnabledFactors = {}, enabledFactorsArray = null) {
  if (Array.isArray(enabledFactorsArray)) {
    const selected = normalizeTriggerList(enabledFactorsArray);
    return {
      rain: selected.includes("rain"),
      heat: selected.includes("heat"),
      aqi: selected.includes("pollution"),
      flood: selected.includes("flood"),
      social: selected.includes("social")
    };
  }

  return {
    rain: typeof userEnabledFactors?.rain === "boolean" ? userEnabledFactors.rain : DEFAULT_ENABLED_FACTORS.rain,
    heat: typeof userEnabledFactors?.heat === "boolean" ? userEnabledFactors.heat : DEFAULT_ENABLED_FACTORS.heat,
    aqi: typeof userEnabledFactors?.aqi === "boolean" ? userEnabledFactors.aqi : DEFAULT_ENABLED_FACTORS.aqi,
    flood: typeof userEnabledFactors?.flood === "boolean" ? userEnabledFactors.flood : DEFAULT_ENABLED_FACTORS.flood,
    social: typeof userEnabledFactors?.social === "boolean" ? userEnabledFactors.social : DEFAULT_ENABLED_FACTORS.social
  };
}

function resolveClaimTriggerContext({
  triggerType = "rain",
  rainMm = 0,
  temperature = 0,
  aqi = 0,
  socialEvent = null,
  threshold = 0,
  thresholdUsed = {}
} = {}) {
  const normalizedTriggerType = normalizeTriggerType(triggerType);
  const rainfallThreshold = toNumber(
    thresholdUsed.rainfall_threshold ?? threshold ?? process.env.TRIGGER_RAIN_THRESHOLD ?? 15,
    15
  );
  const heatThreshold = toNumber(thresholdUsed.heat_threshold ?? process.env.TRIGGER_HEAT_THRESHOLD ?? 38, 38);
  const pollutionThreshold = toNumber(thresholdUsed.pollution_threshold ?? process.env.TRIGGER_AQI_THRESHOLD ?? 150, 150);
  const floodThreshold = toNumber(
    thresholdUsed.flood_threshold ?? Math.max(rainfallThreshold > 0 ? rainfallThreshold * 1.5 : 0, rainfallThreshold + 10),
    0
  );

  let eligible = false;
  switch (normalizedTriggerType) {
    case "heat":
      eligible = toNumber(temperature, 0) >= heatThreshold;
      break;
    case "pollution":
      eligible = toNumber(aqi, 0) > pollutionThreshold;
      break;
    case "flood":
      eligible = toNumber(rainMm, 0) > floodThreshold;
      break;
    case "social":
      eligible = Boolean(socialEvent?.active);
      break;
    case "rain":
    default:
      eligible = toNumber(rainMm, 0) > rainfallThreshold;
      break;
  }

  return {
    triggerType: normalizedTriggerType,
    trigger_type: normalizedTriggerType,
    eligible,
    metrics: {
      rainMm: toNumber(rainMm, 0),
      temperature: toNumber(temperature, 0),
      aqi: toNumber(aqi, 0)
    },
    thresholds: {
      rainfall_threshold: rainfallThreshold,
      heat_threshold: heatThreshold,
      pollution_threshold: pollutionThreshold,
      flood_threshold: floodThreshold
    },
    socialEvent
  };
}

function calculateHeatIncomeImpactPayout(temperature, avgDailyEarning) {
  const temp = Number(temperature || 0);
  const earning = Math.max(0, Number(avgDailyEarning || 0));
  if (!Number.isFinite(temp) || !Number.isFinite(earning) || earning <= 0) {
    return { payoutAmount: 0, impactLevel: "none", impactRatio: 0 };
  }

  if (temp > 45) {
    return { payoutAmount: earning, impactLevel: "extreme", impactRatio: 1 };
  }

  if (temp >= 42) {
    return { payoutAmount: earning * 0.6, impactLevel: "severe", impactRatio: 0.6 };
  }

  if (temp >= 38) {
    return { payoutAmount: earning * 0.3, impactLevel: "moderate", impactRatio: 0.3 };
  }

  return { payoutAmount: 0, impactLevel: "none", impactRatio: 0 };
}

function clampPayout(value, cap) {
  const payout = Math.max(0, Number(value || 0));
  const max = Math.max(0, Number(cap || 0));
  if (!Number.isFinite(payout) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(payout, max);
}

function calculateTriggerPayout({ triggerContext, rainMm, temperature, aqi, avgDailyEarning }) {
  const earning = Math.max(0, Number(avgDailyEarning || 0));
  if (!Number.isFinite(earning) || earning <= 0) {
    return { payoutAmount: 0, maxPayoutAmount: 0, payoutRatio: 0, triggerWeights: {} };
  }

  const triggerTypes = normalizeTriggerList(
    Array.isArray(triggerContext?.trigger_types) && triggerContext.trigger_types.length > 0
      ? triggerContext.trigger_types
      : triggerContext?.trigger_type || triggerContext?.triggerType || "rain"
  );
  const triggerWeights = triggerTypes.reduce((acc, item) => {
    acc[item] = FACTOR_WEIGHTS[item] || 0;
    return acc;
  }, {});
  const totalRatio = Math.min(1, triggerTypes.reduce((sum, item) => sum + (FACTOR_WEIGHTS[item] || 0), 0));

  if (totalRatio <= 0) {
    return {
      payoutAmount: 0,
      maxPayoutAmount: earning,
      payoutRatio: 0,
      triggerWeights
    };
  }

  return {
    payoutAmount: clampPayout(earning * totalRatio, earning),
    maxPayoutAmount: earning,
    payoutRatio: totalRatio,
    triggerWeights
  };
}

function deriveConfidenceDecision(riskScore, fraudScore, eligible) {
  const confidenceScore = clamp01(Number(riskScore) * (1 - clamp01(Number(fraudScore))));

  if (!eligible) {
    return {
      confidence_score: confidenceScore,
      forceStatus: "not_eligible",
      requiresAdminReview: false,
      decision_reason: "threshold_not_met"
    };
  }
  return {
    confidence_score: confidenceScore,
    forceStatus: "pending_approval",
    requiresAdminReview: true,
    decision_reason: "manual_review_required"
  };
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
  triggerType = "rain",
  triggerTypes = [],
  factorObservations = {},
  riskScore = 0,
  fraudScore = 0,
  mlFactors = {},
  modelVersion = "v1.0",
  thresholdUsed = null,
  confidenceScore = 0,
  decisionReason = "",
  requiresAdminReview = false,
  forceStatus = null,
  fraudReason = ""
}) {
  const claimDate = getLocalDateOnly();
  let nextStatus = normalizeStatus(forceStatus || (eligible ? "pending_approval" : "not_eligible"));
  const existingClaim = await Claim.findOne({ userId, date: claimDate });

  // Preserve eligibility once reached for the day unless an explicit forceStatus is provided.
  if (!forceStatus && existingClaim && normalizeStatus(existingClaim.status) === "pending_approval" && nextStatus === "not_eligible") {
    nextStatus = "pending_approval";
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
    trigger_type: triggerTypes.length > 1 ? triggerTypes : triggerType,
    trigger_types: triggerTypes,
    factor_observations: factorObservations,
    risk_score: Number.isFinite(Number(riskScore)) ? Number(riskScore) : 0,
    fraud_score: Number.isFinite(Number(fraudScore)) ? Number(fraudScore) : 0,
    ml_factors: mlFactors && typeof mlFactors === "object" ? mlFactors : {},
    model_version: String(modelVersion || "v1.0"),
    threshold_used: thresholdUsed,
    confidence_score: Number.isFinite(Number(confidenceScore)) ? clamp01(confidenceScore) : 0,
    decision_reason: String(decisionReason || ""),
    fraud_reason: String(fraudReason || ""),
    requiresAdminReview: Boolean(requiresAdminReview),
    adminReviewReason: requiresAdminReview ? String(decisionReason || "manual_review_required") : "",
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
        trigger_type: triggerTypes.length > 1 ? triggerTypes : triggerType,
        trigger_types: triggerTypes,
        factor_observations: factorObservations,
        risk_score: Number.isFinite(Number(riskScore)) ? Number(riskScore) : 0,
        fraud_score: Number.isFinite(Number(fraudScore)) ? Number(fraudScore) : 0,
        ml_factors: mlFactors && typeof mlFactors === "object" ? mlFactors : {},
        model_version: String(modelVersion || "v1.0"),
        threshold_used: thresholdUsed,
        confidence_score: Number.isFinite(Number(confidenceScore)) ? clamp01(confidenceScore) : 0,
        decision_reason: String(decisionReason || ""),
        fraud_reason: String(fraudReason || ""),
        requiresAdminReview: Boolean(requiresAdminReview),
        adminReviewReason: requiresAdminReview ? String(decisionReason || "manual_review_required") : "",
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

async function evaluateClaimEligibility(user, options = {}) {
  const profile = await PartnerProfile.findOne({ userId: user._id }).lean();
  const userConfig = await User.findById(user._id).select("thresholds enabled_factors").lean().catch(() => null);
  const city = validateUserProfile(user, profile);
  const policy = await getActivePolicyOrThrow(user._id, profile);

  const thresholds = normalizeThresholdConfig({
    userThresholds: userConfig?.thresholds || {},
    profile,
    thresholdUsed: options?.thresholdUsed || options?.weatherData?.thresholds || {},
    dynamicRain: options?.dynamicThreshold
  });
  const threshold = Number(thresholds.rain);
  const enabledFactorMap = normalizeEnabledFactorMap(userConfig?.enabled_factors || {}, profile?.enabledFactors || null);

  const currentWeather = options?.currentWeather || options?.weatherData || await fetchCurrentWeather(city);
  const rainMm = Number(options?.weatherData?.rainfall ?? extractRainSafely(currentWeather, 1));
  const temperature = Number(
    options?.weatherData?.temperature ?? currentWeather?.main?.temp ?? currentWeather?.temperature ?? 0
  ) || 0;
  const aqi = Number(options?.weatherData?.aqi ?? currentWeather?.main?.aqi ?? currentWeather?.aqi ?? 50) || 50;
  const socialEvent = options?.socialEvent || options?.weatherData?.socialEvent || null;

  const triggerContext = resolveClaimTriggerContext({
    triggerType: options?.triggerType || "rain",
    rainMm,
    temperature,
    aqi,
    socialEvent,
    threshold,
    thresholdUsed: {
      rainfall_threshold: thresholds.rain,
      heat_threshold: thresholds.heat,
      pollution_threshold: thresholds.aqi,
      flood_threshold: thresholds.flood,
      social_threshold: thresholds.social
    }
  });

  const resolvedDisruption = resolveDisruptionTrigger({
    rainfall: rainMm,
    temperature,
    aqi,
    thresholds: {
      rainfall_threshold: thresholds.rain,
      heat_threshold: thresholds.heat,
      pollution_threshold: thresholds.aqi,
      flood_threshold: thresholds.flood
    },
    socialEvent
  });

  const explicitTriggerTypes = normalizeTriggerList(options?.triggerTypes || []);
  const resolvedTriggers = explicitTriggerTypes.length > 0 ? explicitTriggerTypes : normalizeTriggerList(resolvedDisruption.matchedTriggers || []);
  const matchedTriggerTypes = resolvedTriggers.filter((item) => {
    if (item === "pollution") return enabledFactorMap.aqi;
    return enabledFactorMap[item] !== false;
  });
  console.log("Triggers detected:", matchedTriggerTypes);
  const primaryTriggerType = matchedTriggerTypes[0] || normalizeFactorName(options?.triggerType || triggerContext.trigger_type || "rain");

  if (matchedTriggerTypes.includes("rain")) {
    validateWeatherData(rainMm, triggerContext.thresholds.rainfall_threshold);
  }

  const eligible = matchedTriggerTypes.length > 0;

  const pastClaims = await Claim.countDocuments({ userId: user._id });
  const mlInput = {
    temperature,
    rainfall: rainMm,
    aqi,
    past_claims: pastClaims,
    location_risk: inferLocationRisk(city)
  };
  const mlResult = await getRiskScore({ ...mlInput, userId: user._id });
  const riskScore = clamp01(mlResult?.risk_score);
  const mlFactors = mlResult?.factors && typeof mlResult.factors === "object" ? mlResult.factors : {};
  const modelVersion = String(mlResult?.model_version || "v1.0");

  const locationMismatch = Boolean(profile?.city && user?.location && String(profile.city).trim().toLowerCase() !== String(user.location).trim().toLowerCase());
  const fraudResult = await getFraudScore({
    userId: user._id,
    rainMm,
    threshold,
    triggeredByWeather: eligible,
    isAutoTriggered: true,
    triggerType: primaryTriggerType,
    temperature,
    heatThreshold: triggerContext.thresholds.heat_threshold,
    aqi,
    pollutionThreshold: triggerContext.thresholds.pollution_threshold,
    floodThreshold: triggerContext.thresholds.flood_threshold,
    socialEvent,
    riskScore,
    locationMismatch,
    weatherData: {
      ...(options?.weatherData || {}),
      city
    },
    cityName: city
  });

  const confidence = deriveConfidenceDecision(riskScore, fraudResult.fraud_score, eligible);
  if (eligible && Number(fraudResult.fraud_score || 0) >= 0.7) {
    confidence.forceStatus = "pending_approval";
    confidence.requiresAdminReview = true;
    confidence.decision_reason = "high_fraud_pending_admin_review";
  }

  const weeklyPremium = calculatePremium(riskScore);

  const { payoutAmount, maxPayoutAmount, payoutRatio, triggerWeights } = calculateTriggerPayout({
    triggerContext: {
      ...triggerContext,
      trigger_type: primaryTriggerType,
      trigger_types: matchedTriggerTypes
    },
    rainMm,
    temperature,
    aqi,
    avgDailyEarning: profile?.avgDailyEarning || 0
  });

  console.log("Fraud Score:", fraudResult.fraud_score);
  console.log("Fraud Reason:", fraudResult.fraud_reason);
  console.log("Confidence:", confidence.confidence_score);
  console.log("Threshold:", threshold);
  console.log("Premium:", weeklyPremium);
  if (triggerContext.trigger_type === "heat") {
    console.log("Heat Trigger:", temperature);
    console.log("Heat Claim Triggered");
  }

  await Promise.all([
    User.findByIdAndUpdate(user._id, { $set: { riskScore: riskScore, risk_score: riskScore } }),
    Policy.updateOne({ userId: user._id, isActive: true }, { $set: { weekly_premium: weeklyPremium } })
  ]);

  logger.info("ML integration completed", {
    userId: user._id.toString(),
    riskScore,
    fraudScore: fraudResult.fraud_score,
    weeklyPremium
  });

  const claim = await upsertDailyClaimRecord({
    userId: user._id,
    city,
    rainMm,
    threshold,
    riskLevel: eligible ? "HIGH" : "LOW",
    eligible,
    amount: payoutAmount,
    payoutAmount,
    maxPayoutAmount,
    autoTriggered: true,
    triggerType: primaryTriggerType,
    triggerTypes: matchedTriggerTypes,
    factorObservations: {
      rainMm,
      temperature,
      aqi,
      socialEventActive: Boolean(socialEvent?.active),
      payoutRatio,
      triggerWeights,
      enabled_factors: enabledFactorMap,
      thresholds
    },
    riskScore,
    fraudScore: fraudResult.fraud_score,
    fraudReason: fraudResult.fraud_reason,
    mlFactors,
    modelVersion,
    thresholdUsed: {
      ...(options?.thresholdUsed || options?.weatherData?.thresholds || {}),
      rainfall_threshold: thresholds.rain,
      heat_threshold: thresholds.heat,
      pollution_threshold: thresholds.aqi,
      flood_threshold: thresholds.flood,
      social_threshold: thresholds.social,
      enabled_factors: enabledFactorMap
    },
    confidenceScore: confidence.confidence_score,
    decisionReason: confidence.decision_reason,
    requiresAdminReview: confidence.requiresAdminReview,
    forceStatus: confidence.forceStatus
  });

  await logAudit("CLAIM_CREATED", user._id, {
    claimId: claim?._id ? String(claim._id) : null,
    city,
    rainMm,
    threshold,
    riskScore,
    fraudScore: fraudResult.fraud_score,
    fraudReason: fraudResult.fraud_reason,
    confidence: confidence.confidence_score,
    status: claim?.status || null,
    decisionReason: confidence.decision_reason,
    trigger_type: claim?.trigger_type || primaryTriggerType,
    trigger_types: matchedTriggerTypes,
    modelVersion
  });

  logger.info("Fraud detection evaluated", {
    userId: user._id.toString(),
    fraudScore: fraudResult.fraud_score,
    shouldReject: fraudResult.should_reject,
    reasons: fraudResult.reasons,
    trigger_type: primaryTriggerType,
    trigger_types: matchedTriggerTypes
  });

  logger.info("Claim eligibility evaluated", {
    userId: user._id.toString(),
    city,
    rain: rainMm,
    threshold,
    decision: eligible ? "ELIGIBLE" : "NOT_ELIGIBLE",
    status: claim?.status || "none",
    trigger_type: triggerContext.trigger_type,
    trigger_types: matchedTriggerTypes
  });

  return {
    policy,
    city,
    rainMm,
    threshold,
    riskScore,
    fraudScore: fraudResult.fraud_score,
    confidenceScore: confidence.confidence_score,
    weeklyPremium,
    eligible,
    status: claim?.status || (eligible ? "pending_approval" : "not_eligible"),
    claim
  };
}

async function requestClaimForApproval(user, claimId = null) {
  const profile = await PartnerProfile.findOne({ userId: user._id }).lean().catch(() => null);
  if (profile?.city) {
    await getActivePolicyOrThrow(user._id, profile);
  }

  const query = {
    userId: user._id,
    status: { $in: ["eligible", "pending_approval"] }
  };

  if (claimId) {
    const reviewedClaim = await Claim.findOne({ _id: claimId, userId: user._id }).select("requiresAdminReview status").lean();
    if (normalizeStatus(reviewedClaim?.status) === "pending_approval") {
      const existingPending = await Claim.findOne({ _id: claimId, userId: user._id });
      return existingPending;
    }
    query._id = claimId;
  }

  const requestedClaim = await executeInTransaction(async (session) => {
    const requestedAt = new Date();
    const claim = await Claim.findOneAndUpdate(
      query,
      {
        $set: {
          status: "pending_approval",
          requiresAdminReview: true,
          adminReviewReason: "worker_requested_claim",
          requestedAt
        },
        $push: {
          auditLogs: buildAuditEntry("CLAIM_REQUESTED", {
            claimId,
            requestedAt,
            source: "worker"
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
      const err = new Error(claimId ? "Claim is not eligible for request." : "No eligible claim found to request.");
      err.statusCode = 404;
      err.errorCode = claimId ? "CLAIM_NOT_REQUESTABLE" : "NO_ELIGIBLE_CLAIM";
      throw err;
    }

    return claim;
  });

  logger.info("Claim requested by user", {
    userId: user._id.toString(),
    claimId: String(requestedClaim._id),
    status: requestedClaim.status
  });

  logger.info("Sent to admin approval", {
    userId: user._id.toString(),
    claimId: String(requestedClaim._id)
  });

  await logAudit("CLAIM_REQUESTED", user._id, {
    claimId: String(requestedClaim._id),
    status: requestedClaim.status
  });

  return requestedClaim;
}

async function redeemEligibleClaim(user, claimId = null) {
  return requestClaimForApproval(user, claimId);
}

async function createAutoTriggeredClaim(user, triggerType = "rain", options = {}) {
  const normalizedTriggerType = normalizeTriggerType(triggerType);
  const normalizedTriggerTypes = normalizeTriggerList(options?.triggerTypes || [normalizedTriggerType]);
  const result = await evaluateClaimEligibility(user, {
    ...options,
    triggerType: normalizedTriggerType,
    triggerTypes: normalizedTriggerTypes
  });
  if (!result?.claim) {
    return result;
  }

  if (result.claim.status === "pending_approval") {
    result.eligible = true;
  }

  const currentTriggers = normalizeTriggerList(result.claim.trigger_types || result.claim.trigger_type || []);
  if (normalizedTriggerTypes.length > 0 && JSON.stringify(currentTriggers) !== JSON.stringify(normalizedTriggerTypes)) {
    result.claim = await Claim.findByIdAndUpdate(
      result.claim._id,
      {
        $set: {
          triggerType: normalizedTriggerTypes[0] || normalizedTriggerType,
          trigger_type: normalizedTriggerTypes.length > 1 ? normalizedTriggerTypes : normalizedTriggerTypes[0] || normalizedTriggerType,
          trigger_types: normalizedTriggerTypes
        }
      },
      { new: true }
    );
  }

  logger.info("Auto claim processed", {
    userId: user._id.toString(),
    triggerType: normalizedTriggerTypes[0] || normalizedTriggerType,
    trigger_type: normalizedTriggerTypes.length > 1 ? normalizedTriggerTypes : normalizedTriggerTypes[0] || normalizedTriggerType,
    trigger_types: normalizedTriggerTypes,
    claimStatus: result.claim.status,
    payoutAmount: result.claim.payoutAmount,
    riskScore: result.claim.risk_score,
    fraudScore: result.claim.fraud_score
  });

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
  if (status && normalized !== "not_eligible") {
    query.status = normalized === "pending_approval"
      ? { $in: ["pending_approval", "eligible"] }
      : normalized;
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
  resolveClaimTriggerContext,
  calculateTriggerPayout,
  evaluateClaimEligibility,
  createAutoTriggeredClaim,
  requestClaimForApproval,
  redeemEligibleClaim,
  listClaimsForUser,
  listClaimsForInsurer
};
