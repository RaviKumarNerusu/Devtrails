const Policy = require("../models/Policy");
const Claim = require("../models/Claim");
const { buildTodayCompensation } = require("../services/compensationService");
const { evaluateClaimEligibility, listClaimsForUser } = require("../services/claimService");

async function getDashboardSummary(req, res, next) {
  try {
    const userId = req.user._id;
    const activePolicy = await Policy.findOne({ userId, isActive: true }).sort({ createdAt: -1 }).lean();

    const todayComp = await buildTodayCompensation(req.user);
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
        showTakePolicy: true,
        todayComp,
        claim: null,
        claimSummary: { total: 0, paid: 0 },
        recentClaims: [],
        user: userPayload
      });
    }

    const claimResult = await evaluateClaimEligibility(req.user);
    const claims = await listClaimsForUser(userId);
    const approvedCount = claims.filter((c) => String(c.status || "").toLowerCase() === "approved").length;

    return res.json({
      hasPolicy: true,
      showTakePolicy: false,
      policy: activePolicy,
      todayComp,
      claim: claimResult?.claim || claims[0] || null,
      eligible: Boolean(claimResult?.eligible),
      status: claimResult?.status || null,
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
      Claim.find({}).select("status payoutAmount city createdAt").lean(),
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
      predictedNextWeekClaims
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getDashboardSummary, getInsurerAnalytics };
