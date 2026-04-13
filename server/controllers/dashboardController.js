const Policy = require("../models/Policy");
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

module.exports = { getDashboardSummary };
