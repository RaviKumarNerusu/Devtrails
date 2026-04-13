const User = require("../models/User");
const Claim = require("../models/Claim");
const { simulateInstantPayout } = require("./gatewayService");
const logger = require("../utils/logger");

function normalizeNonNegativeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function calculateRisk(rainMm, thresholdMm) {
  const rain = normalizeNonNegativeNumber(rainMm);
  const threshold = normalizeNonNegativeNumber(thresholdMm);

  if (threshold <= 0) return "UNKNOWN";

  if (rain < threshold * 0.5) return "LOW";
  if (rain < threshold) return "MEDIUM";
  if (rain < threshold * 1.5) return "HIGH";
  return "SEVERE";
}

function calculatePayout(rainMm, thresholdMm, avgDailyEarning) {
  const rain = normalizeNonNegativeNumber(rainMm);
  const threshold = normalizeNonNegativeNumber(thresholdMm);
  const earning = normalizeNonNegativeNumber(avgDailyEarning);

  if (threshold <= 0 || earning <= 0) return 0;

  if (rain < threshold * 0.5) return 0;
  if (rain < threshold) return earning * 0.3;
  if (rain < threshold * 1.5) return earning * 0.6;
  return earning;
}

async function simulateClaimPayout({ claimId, userId, payoutAmount, session = null }) {
  const amount = normalizeNonNegativeNumber(payoutAmount);
  if (!userId || amount <= 0) {
    return { paid: false, amount: 0, wallet_balance: 0 };
  }

  const gatewayResult = await simulateInstantPayout({
    amount,
    gateway: process.env.SIMULATED_PAYOUT_GATEWAY || "razorpay-sandbox"
  });

  if (gatewayResult.status !== "success") {
    return { paid: false, amount: 0, wallet_balance: 0, gateway: gatewayResult };
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { wallet_balance: amount } },
    { new: true, session }
  );

  if (claimId) {
    await Claim.findByIdAndUpdate(
      claimId,
      {
        $set: { paidAt: new Date() },
        $push: {
          auditLogs: {
            action: "INSTANT_PAYOUT_SIMULATED",
            timestamp: new Date(),
            details: gatewayResult
          }
        }
      },
      { session }
    );
  }

  logger.info("Instant payout simulated", {
    userId: userId?.toString(),
    claimId: claimId?.toString?.() || claimId,
    amount,
    gateway: gatewayResult.gateway,
    transactionId: gatewayResult.transactionId,
    latencyMs: gatewayResult.latencyMs
  });

  return {
    paid: true,
    amount,
    wallet_balance: Number(user?.wallet_balance || 0),
    gateway: gatewayResult
  };
}

module.exports = {
  calculateRisk,
  calculatePayout,
  simulateClaimPayout
};

