const Policy = require("../models/Policy");
const Claim = require("../models/Claim");
const { buildTodayCompensation } = require("../services/compensationService");
const { evaluateClaimEligibility, listClaimsForUser } = require("../services/claimService");

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function filterClaimsLastNDays(claims, days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return claims.filter((item) => new Date(item?.createdAt || 0) >= cutoff);
}

function calculatePredictionMetrics(claims = []) {
  const recentClaims = filterClaimsLastNDays(claims, 7);
  const scores = recentClaims.map((item) => toNumber(item?.risk_score ?? item?.riskScore ?? 0));
  const avgRisk = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;

  const weightedClaims = [...recentClaims].sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));
  const weightedTotals = weightedClaims.reduce(
    (acc, item, index) => {
      const weight = index + 1;
      const score = toNumber(item?.risk_score ?? item?.riskScore ?? 0);
      return {
        score: acc.score + score * weight,
        weight: acc.weight + weight
      };
    },
    { score: 0, weight: 0 }
  );

  const nextWeekRisk = weightedTotals.weight > 0 ? weightedTotals.score / weightedTotals.weight : avgRisk;

  return {
    next_week_risk: Number(nextWeekRisk.toFixed(4)),
    avg_risk: Number(avgRisk.toFixed(4)),
    total_claims_last_week: recentClaims.length
  };
}

async function getDashboardSummary(req, res, next) {
  try {
    const userId = req.user._id;
    const activePolicy = await Policy.findOne({ userId, isActive: true }).sort({ createdAt: -1 }).lean();

    const todayComp = await buildTodayCompensation(req.user);
    const claims = await listClaimsForUser(userId);
    const predictionMetrics = calculatePredictionMetrics(claims);
    const userPayload = {
      id: userId,
      wallet_balance: Number(req.user?.wallet_balance || 0),
      risk_score: Number(req.user?.risk_score ?? req.user?.riskScore ?? 0)
    };

    if (!activePolicy) {
      return res.json({
        hasPolicy: false,
        rainMm: todayComp?.rainMm ?? 0,
        threshold: todayComp?.threshold ?? todayComp?.rainThresholdMm ?? 0,
        predictedLoss: todayComp?.predictedLoss ?? 0,
        next_week_risk: predictionMetrics.next_week_risk,
        avg_risk: predictionMetrics.avg_risk,
        total_claims_last_week: predictionMetrics.total_claims_last_week,
        showTakePolicy: true,
        todayComp,
        claim: null,
        claimSummary: { total: 0, paid: 0 },
        recentClaims: [],
        user: userPayload
      });
    }

    const claimResult = await evaluateClaimEligibility(req.user);
    const approvedCount = claims.filter((c) => String(c.status || "").toLowerCase() === "approved").length;

    return res.json({
      hasPolicy: true,
      showTakePolicy: false,
      policy: activePolicy,
      todayComp,
      claim: claimResult?.claim || claims[0] || null,
      eligible: Boolean(claimResult?.eligible),
      status: claimResult?.status || null,
      next_week_risk: predictionMetrics.next_week_risk,
      avg_risk: predictionMetrics.avg_risk,
      total_claims_last_week: predictionMetrics.total_claims_last_week,
      user: userPayload,
      claimSummary: {
        total: claims.length,
        paid: approvedCount
      },
      recentClaims: claims.slice(0, 3)
    });
  } catch (err) {
    next(err);
  }
}

async function getInsurerAnalytics(req, res, next) {
  try {
    const [claims, activePolicies] = await Promise.all([
      Claim.find({}).select("status payoutAmount city createdAt risk_score").lean(),
      Policy.find({ isActive: true }).select("weekly_premium").lean()
    ]);

    const totalClaims = claims.length;
    const approvedClaims = claims.filter((item) => String(item.status || "").toLowerCase() === "approved").length;
    const rejectedClaims = claims.filter((item) => String(item.status || "").toLowerCase() === "rejected").length;
    const totalPayout = claims.reduce((sum, item) => sum + (Number(item.payoutAmount || 0) || 0), 0);
    const totalWeeklyPremium = activePolicies.reduce((sum, item) => sum + (Number(item.weekly_premium || 0) || 0), 0);
    const lossRatio = totalWeeklyPremium > 0 ? totalPayout / totalWeeklyPremium : 0;

    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentClaims = claims.filter((item) => new Date(item.createdAt) >= last30Days);
    const byCity = recentClaims.reduce((acc, item) => {
      const city = String(item.city || "unknown");
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {});

    const predictionMetrics = calculatePredictionMetrics(claims);

    const predictedNextWeekClaims = Object.entries(byCity).map(([city, count]) => ({
      city,
      predictedClaims: Number(((count / 30) * 7).toFixed(2))
    }));

    return res.json({
      totalClaims,
      approvedClaims,
      rejectedClaims,
      totalPayout,
      totalWeeklyPremium,
      lossRatio: Number(lossRatio.toFixed(4)),
      next_week_risk: predictionMetrics.next_week_risk,
      avg_risk: predictionMetrics.avg_risk,
      predictedNextWeekClaims
    });
  } catch (error) {
    return next(error);
  }
}

async function getAdminPredictions(req, res, next) {
  try {
    const claims = await Claim.find({})
      .select("risk_score createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const predictionMetrics = calculatePredictionMetrics(claims);

    console.log("Next Week Risk:", predictionMetrics.next_week_risk);

    return res.json({
      next_week_risk: predictionMetrics.next_week_risk,
      avg_risk: predictionMetrics.avg_risk,
      total_claims_last_week: predictionMetrics.total_claims_last_week
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getDashboardSummary, getInsurerAnalytics, getAdminPredictions, calculatePredictionMetrics };
