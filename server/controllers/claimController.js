const Claim = require("../models/Claim");
const {
  evaluateClaimEligibility,
  redeemEligibleClaim,
  requestClaimForApproval,
  listClaimsForUser,
  listClaimsForInsurer,
  isClaimEligibleStatus
} = require("../services/claimService");
const { simulateClaimPayout } = require("../services/payoutService");
const { executeInTransaction } = require("../utils/transactionHelper");
const { logAudit } = require("../services/auditLogService");
const { getLocalDateOnly } = require("../utils/claimValidator");
const logger = require("../utils/logger");
const { Types } = require("mongoose");

function normalizeClaimPayload(claim) {
  if (!claim) return claim;
  const claimObj = typeof claim?.toObject === "function" ? claim.toObject({ depopulate: true }) : claim;
  const payout = Number(claimObj?.payoutAmount ?? claimObj?.amount ?? 0);
  return {
    ...claimObj,
    risk_score: Number(claimObj?.risk_score ?? 0),
    fraud_score: Number(claimObj?.fraud_score ?? 0),
    fraud_reason: String(claimObj?.fraud_reason || ""),
    confidence_score: Number(claimObj?.confidence_score ?? 0),
    decision_reason: String(claimObj?.decision_reason || ""),
    ml_factors: claimObj?.ml_factors || {},
    model_version: String(claimObj?.model_version || "v1.0"),
    threshold_used: claimObj?.threshold_used ?? null,
    trigger_type: claimObj?.trigger_type || claimObj?.triggerType || "rain",
    payout_amount: payout,
    status: claimObj?.status || "not_eligible"
  };
}

/**
 * Trigger automatic claim processing
 * POST /api/claim/auto
 * Rate limited: 5 requests per minute per user
 */
async function autoClaim(req, res, next) {
  try {
    const userId = req.user._id.toString();

    logger.info("Claim auto request received", {
      userId,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    const result = await evaluateClaimEligibility(req.user);

    // Log successful automation
    logger.info("Claim automation completed successfully", {
      userId,
      city: result.city,
      rainMm: result.rainMm,
      claimCreated: !!result.claim,
      claimDecision: result.status
    });

    if (!result.claim) {
      const err = new Error("Claim record was not created");
      err.statusCode = 500;
      err.errorCode = "CLAIM_NOT_CREATED";
      throw err;
    }

    return res.status(201).json({
      success: true,
      claim: normalizeClaimPayload(result.claim),
      eligible: result.eligible,
      status: result.status,
      data: {
        city: result.city,
        rainMm: result.rainMm,
        threshold: result.threshold,
        eligible: result.eligible,
        status: result.status,
        claim: normalizeClaimPayload(result.claim)
      },
      message: result.eligible ? "Claim record updated as eligible." : "Claim record updated as not eligible."
    });
  } catch (err) {
    logger.error("Claim automation failed", {
      userId: req.user?._id?.toString(),
      error: err.message,
      errorCode: err.errorCode,
      statusCode: err.statusCode
    });

    // Standardize error response
    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || "CLAIM_AUTOMATION_FAILED";
    next(err);
  }
}

/**
 * Get user's claim history
 * GET /api/claim/my
 */
async function listMyClaims(req, res, next) {
  try {
    const userId = req.user._id;
    const claims = await listClaimsForUser(userId);

    logger.debug("Claims retrieved", {
      userId: userId.toString(),
      count: claims.length
    });

    const normalizedClaims = claims.map(normalizeClaimPayload);

    return res.json({
      success: true,
      claims: normalizedClaims,
      data: { claims: normalizedClaims },
      message: "Claims retrieved successfully"
    });
  } catch (err) {
    logger.error("Failed to retrieve claims", {
      userId: req.user?._id?.toString(),
      error: err.message
    });

    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || "CLAIM_RETRIEVAL_FAILED";
    next(err);
  }
}

/**
 * Redeem an eligible claim manually
 * POST /api/claim/redeem
 */
async function redeemClaim(req, res, next) {
  try {
    const claimId = req.body?.claimId || req.body?.claim_id || req.params?.claimId || null;

    if (claimId && !Types.ObjectId.isValid(claimId)) {
      const err = new Error("Invalid claim id");
      err.statusCode = 400;
      err.errorCode = "INVALID_CLAIM_ID";
      throw err;
    }

    if (claimId) {
      const currentClaim = await Claim.findOne({ _id: claimId, userId: req.user._id }).select("requiresAdminReview").lean();
      if (currentClaim?.requiresAdminReview) {
        const err = new Error("Claim is pending manual review.");
        err.statusCode = 409;
        err.errorCode = "MANUAL_REVIEW_REQUIRED";
        throw err;
      }
    }

    const claim = await redeemEligibleClaim(req.user, claimId);
    return res.json({
      success: true,
      claim: normalizeClaimPayload(claim),
      eligible: isClaimEligibleStatus(claim.status),
      status: claim.status,
      data: { claim: normalizeClaimPayload(claim) },
      message: "Claim sent for admin approval successfully"
    });
  } catch (err) {
    logger.error("Failed to redeem claim", {
      userId: req.user?._id?.toString(),
      error: err.message,
      errorCode: err.errorCode
    });
    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || "CLAIM_REDEEM_FAILED";
    next(err);
  }
}

/**
 * Worker: request claim for admin approval
 * POST /api/claim/request
 */
async function requestClaim(req, res, next) {
  try {
    const claimId = req.body?.claimId || req.body?.claim_id || null;
    const claim = await requestClaimForApproval(req.user, claimId);

    return res.json({
      success: true,
      claim: normalizeClaimPayload(claim),
      status: claim.status,
      data: { claim: normalizeClaimPayload(claim) },
      message: "Claim requested successfully"
    });
  } catch (err) {
    logger.error("Failed to request claim", {
      userId: req.user?._id?.toString(),
      claimId: req.body?.claimId || req.body?.claim_id,
      error: err.message,
      errorCode: err.errorCode
    });
    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || "CLAIM_REQUEST_FAILED";
    next(err);
  }
}

/**
 * Get specific claim details
 * GET /api/claim/:claimId
 */
async function getClaimDetails(req, res, next) {
  try {
    const { claimId } = req.params;
    const userId = req.user._id;

    if (!Types.ObjectId.isValid(claimId)) {
      const err = new Error("Invalid claim id");
      err.statusCode = 400;
      err.errorCode = "INVALID_CLAIM_ID";
      throw err;
    }

    const claim = await Claim.findOne({
      _id: claimId,
      userId
    }).lean();

    if (!claim) {
      const err = new Error("Claim not found");
      err.statusCode = 404;
      err.errorCode = "CLAIM_NOT_FOUND";
      throw err;
    }

    return res.json({
      success: true,
      claim: normalizeClaimPayload(claim),
      eligible: isClaimEligibleStatus(claim.status),
      status: claim.status,
      data: normalizeClaimPayload(claim),
      message: "Claim details retrieved successfully"
    });
  } catch (err) {
    logger.error("Failed to retrieve claim details", {
      userId: req.user?._id?.toString(),
      claimId: req.params.claimId,
      error: err.message
    });

    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || "CLAIM_DETAIL_FAILED";
    next(err);
  }
}

/**
 * Insurer claim history with pagination and filters
 * GET /api/claim/all
 */
async function listAllClaims(req, res, next) {
  try {
    const page = req.query?.page;
    const limit = req.query?.limit;
    const userId = req.query?.userId;
    const status = req.query?.status;
    const from = req.query?.from;
    const to = req.query?.to;

    if (userId && !Types.ObjectId.isValid(userId)) {
      const err = new Error("Invalid user id");
      err.statusCode = 400;
      err.errorCode = "INVALID_USER_ID";
      throw err;
    }

    const result = await listClaimsForInsurer({ page, limit, userId, status, from, to });
    const normalizedClaims = result.claims.map(normalizeClaimPayload);

    return res.json({
      success: true,
      claims: normalizedClaims,
      pagination: result.pagination,
      data: {
        ...result,
        claims: normalizedClaims
      },
      message: "Full claim history retrieved successfully"
    });
  } catch (err) {
    logger.error("Failed to retrieve full claim history", {
      userId: req.user?._id?.toString(),
      error: err.message
    });

    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || "CLAIM_HISTORY_RETRIEVAL_FAILED";
    next(err);
  }
}

async function listPendingClaimsForAdmin(req, res, next) {
  req.query = {
    ...(req.query || {}),
    status: req.query?.status || "pending_approval"
  };
  return listAllClaims(req, res, next);
}

/**
 * Get claim statistics for user
 * GET /api/claim/stats
 */
async function getClaimStats(req, res, next) {
  try {
    const userId = req.user._id;

    // Get claim statistics
    const stats = await Claim.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalPayout: { $sum: "$payoutAmount" }
        }
      }
    ]);

    const statsObj = stats.reduce((acc, stat) => {
      acc[stat._id] = { count: stat.count, totalPayout: stat.totalPayout };
      return acc;
    }, {});

    // Get today's status
    const dayStart = getLocalDateOnly();
    const todaysClaim = await Claim.findOne({ userId, date: dayStart }).lean();

    return res.json({
      success: true,
      data: {
        stats: statsObj,
        todaysClaim: todaysClaim || null,
        lastUpdated: new Date().toISOString()
      },
      message: "Claim statistics retrieved successfully"
    });
  } catch (err) {
    logger.error("Failed to retrieve claim stats", {
      userId: req.user?._id?.toString(),
      error: err.message
    });

    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || "STATS_RETRIEVAL_FAILED";
    next(err);
  }
}

/**
 * Admin: approve a claim
 * POST /api/admin/claim/approve
 */
async function approveClaimByAdmin(req, res, next) {
  try {
    const claimId = req.params?.claimId || req.body?.claimId || req.body?.claim_id;
    const reason = String(req.body?.reason || "approved_by_admin").trim();

    if (!claimId || !Types.ObjectId.isValid(claimId)) {
      const err = new Error("Invalid claim id");
      err.statusCode = 400;
      err.errorCode = "INVALID_CLAIM_ID";
      throw err;
    }

    const updatedClaim = await executeInTransaction(async (session) => {
      const claim = await Claim.findById(claimId).session(session);
      if (!claim) {
        const err = new Error("Claim not found");
        err.statusCode = 404;
        err.errorCode = "CLAIM_NOT_FOUND";
        throw err;
      }

      const currentStatus = String(claim.status || "").toLowerCase();

      if (currentStatus === "paid") {
        const err = new Error("Claim is already paid");
        err.statusCode = 409;
        err.errorCode = "CLAIM_ALREADY_PAID";
        throw err;
      }

      if (currentStatus === "approved") {
        const err = new Error("Claim is already approved");
        err.statusCode = 409;
        err.errorCode = "CLAIM_ALREADY_APPROVED";
        throw err;
      }

      if (currentStatus === "rejected") {
        const err = new Error("Rejected claim cannot be approved");
        err.statusCode = 409;
        err.errorCode = "CLAIM_ALREADY_REJECTED";
        throw err;
      }

      const approvableStatuses = new Set(["pending_approval", "pending", "eligible", "claimed"]);
      if (!approvableStatuses.has(currentStatus)) {
        const err = new Error("Only pending claims can be approved");
        err.statusCode = 409;
        err.errorCode = "CLAIM_NOT_PENDING_APPROVAL";
        throw err;
      }

      claim.status = "approved";
      claim.approvedAt = claim.approvedAt || new Date();
      claim.requiresAdminReview = false;
      claim.adminDecision = "approved";
      claim.adminReviewReason = reason;
      claim.adminReviewedBy = req.user._id;
      claim.adminReviewedAt = new Date();
      claim.auditLogs.push({
        action: "CLAIM_APPROVED_BY_ADMIN",
        timestamp: new Date(),
        details: {
          adminId: String(req.user._id),
          previousStatus: currentStatus,
          reason
        }
      });
      await claim.save({ session });

      logger.info("Admin approved claim", {
        adminId: req.user?._id?.toString(),
        claimId: String(claim._id),
        userId: String(claim.userId)
      });

      if (Number(claim.payoutAmount || 0) > 0 && !claim.paidAt) {
        await simulateClaimPayout({
          claimId: claim._id,
          userId: claim.userId,
          payoutAmount: claim.payoutAmount,
          session
        });
      }

      claim.paidAt = claim.paidAt || new Date();
      claim.auditLogs.push({
        action: "CLAIM_PAYOUT_CREDITED",
        timestamp: new Date(),
        details: {
          adminId: String(req.user._id),
          payoutAmount: Number(claim.payoutAmount || 0)
        }
      });
      await claim.save({ session });

      logger.info("Payout processed", {
        claimId: String(claim._id),
        userId: String(claim.userId),
        payoutAmount: Number(claim.payoutAmount || 0)
      });

      return claim;
    });

    await logAudit("CLAIM_APPROVED_BY_ADMIN", req.user._id, {
      claimId,
      reason,
      status: updatedClaim.status
    });

    return res.json({
      success: true,
      claim: normalizeClaimPayload(updatedClaim),
      data: { claim: normalizeClaimPayload(updatedClaim) },
      message: "Claim approved successfully"
    });
  } catch (err) {
    logger.error("Admin claim approval failed", {
      adminId: req.user?._id?.toString(),
      claimId: req.body?.claimId,
      error: err.message,
      errorCode: err.errorCode
    });

    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || "ADMIN_CLAIM_APPROVAL_FAILED";
    next(err);
  }
}

/**
 * Admin: reject a claim
 * POST /api/admin/claim/reject
 */
async function rejectClaimByAdmin(req, res, next) {
  try {
    const claimId = req.params?.claimId || req.body?.claimId || req.body?.claim_id;
    const reason = String(req.body?.reason || "rejected_by_admin").trim();

    if (!claimId || !Types.ObjectId.isValid(claimId)) {
      const err = new Error("Invalid claim id");
      err.statusCode = 400;
      err.errorCode = "INVALID_CLAIM_ID";
      throw err;
    }

    const claim = await Claim.findById(claimId);
    if (!claim) {
      const err = new Error("Claim not found");
      err.statusCode = 404;
      err.errorCode = "CLAIM_NOT_FOUND";
      throw err;
    }

    const currentStatus = String(claim.status || "").toLowerCase();
    if (currentStatus === "rejected") {
      const err = new Error("Claim is already rejected");
      err.statusCode = 409;
      err.errorCode = "CLAIM_ALREADY_REJECTED";
      throw err;
    }

    if (currentStatus === "approved") {
      const err = new Error("Approved claim cannot be rejected");
      err.statusCode = 409;
      err.errorCode = "CLAIM_ALREADY_APPROVED";
      throw err;
    }

    if (currentStatus === "paid") {
      const err = new Error("Paid claim cannot be rejected");
      err.statusCode = 409;
      err.errorCode = "CLAIM_ALREADY_PAID";
      throw err;
    }

    const rejectableStatuses = new Set(["pending_approval", "pending", "eligible", "claimed"]);
    if (!rejectableStatuses.has(currentStatus)) {
      const err = new Error("Only pending claims can be rejected");
      err.statusCode = 409;
      err.errorCode = "CLAIM_NOT_PENDING_APPROVAL";
      throw err;
    }

    claim.status = "rejected";
    claim.requiresAdminReview = false;
    claim.adminDecision = "rejected";
    claim.adminReviewReason = reason;
    claim.adminReviewedBy = req.user._id;
    claim.adminReviewedAt = new Date();
    claim.auditLogs.push({
      action: "CLAIM_REJECTED_BY_ADMIN",
      timestamp: new Date(),
      details: {
        adminId: String(req.user._id),
        previousStatus: currentStatus,
        reason
      }
    });

    await claim.save();

    await logAudit("CLAIM_REJECTED_BY_ADMIN", req.user._id, {
      claimId,
      reason,
      status: claim.status
    });

    return res.json({
      success: true,
      claim: normalizeClaimPayload(claim),
      data: { claim: normalizeClaimPayload(claim) },
      message: "Claim rejected successfully"
    });
  } catch (err) {
    logger.error("Admin claim rejection failed", {
      adminId: req.user?._id?.toString(),
      claimId: req.body?.claimId,
      error: err.message,
      errorCode: err.errorCode
    });

    err.statusCode = err.statusCode || 500;
    err.errorCode = err.errorCode || "ADMIN_CLAIM_REJECTION_FAILED";
    next(err);
  }
}

module.exports = {
  autoClaim,
  listMyClaims,
  redeemClaim,
  requestClaim,
  getClaimDetails,
  getClaimStats,
  listAllClaims,
  listPendingClaimsForAdmin,
  approveClaimByAdmin,
  rejectClaimByAdmin
};

