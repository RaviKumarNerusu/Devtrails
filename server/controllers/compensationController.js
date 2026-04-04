const { buildTodayCompensation, createOrUpdateTodayPayout, listRecentPayouts } = require("../services/compensationService");
const { calculateRisk, calculatePayout } = require("../services/payoutService");
const { evaluateClaimEligibility } = require("../services/claimService");

async function getTodayCompensation(req, res, next) {
  try {
    const payload = await buildTodayCompensation(req.user);
    if (!payload?.hasPolicy) {
      return res.json({
        hasPolicy: false,
        rainMm: payload?.rainMm ?? 0,
        threshold: payload?.threshold ?? payload?.rainThresholdMm ?? 0,
        predictedLoss: payload?.predictedLoss ?? 0,
        showTakePolicy: true
      });
    }

    const claimResult = await evaluateClaimEligibility(req.user);

    // Persist daily insurance state (including payout=0) so analytics can render correctly.
    await createOrUpdateTodayPayout(req.user, payload);

    res.json({
      ...payload,
      hasPolicy: true,
      claim: claimResult.claim,
      eligible: claimResult.eligible,
      status: claimResult.status,
      threshold: claimResult.threshold
    });
  } catch (err) {
    next(err);
  }
}

async function triggerPayout(req, res, next) {
  try {
    const todayComp = await buildTodayCompensation(req.user);
    if (!todayComp?.hasPolicy) {
      return res.status(400).json({
        success: false,
        message: "No active policy. Take policy to recover payout."
      });
    }
    const payout = await createOrUpdateTodayPayout(req.user, todayComp);
    res.status(201).json({ payout, todayComp });
  } catch (err) {
    next(err);
  }
}

async function listPayouts(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days || 30), 180);
    const city = req.query.city ? String(req.query.city).trim() : null;
    const items = await listRecentPayouts(req.user._id, days, city);
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

async function calculatePayoutPreview(req, res, next) {
  try {
    const rainMm = Number(req.body?.rain_mm ?? req.body?.rainMm ?? 0);
    const threshold = Number(req.body?.threshold ?? 0);
    const avgEarning = Number(req.body?.avgEarning ?? req.body?.avgDailyEarning ?? 0);

    const risk = calculateRisk(rainMm, threshold);
    const payout = calculatePayout(rainMm, threshold, avgEarning);

    res.json({
      rain_mm: Number.isFinite(rainMm) ? rainMm : 0,
      risk,
      payout,
      triggered: payout > 0
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTodayCompensation, triggerPayout, listPayouts, calculatePayoutPreview };

