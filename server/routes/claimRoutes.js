const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const rateLimiterClaimAuto = require("../middleware/rateLimiter");
const {
  autoClaim,
  listMyClaims,
  redeemClaim,
  requestClaim,
  getClaimDetails,
  getClaimStats,
  listAllClaims
} = require("../controllers/claimController");

const router = express.Router();

/**
 * Claim routes with full validation and fraud prevention
 */

// Trigger automatic claim (rate-limited: 5 req/min per user)
router.post("/auto", protect.required, rateLimiterClaimAuto, autoClaim);

// Redeem eligible claim manually
router.post("/redeem", protect.required, redeemClaim);

// Request an eligible claim for admin approval
router.post("/request", protect.required, requestClaim);

// Get user's claim history
router.get("/my", protect.required, listMyClaims);

// Get full claims history (insurer view)
router.get("/all", protect.required, protect.insurer, listAllClaims);

// Get claim statistics
router.get("/stats/overview", protect.required, getClaimStats);

// Get specific claim details
router.get("/:claimId", protect.required, getClaimDetails);

module.exports = router;

