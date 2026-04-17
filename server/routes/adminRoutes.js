const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getAdminPredictions } = require("../controllers/dashboardController");
const {
	listAllClaims,
	listPendingClaimsForAdmin,
	approveClaimByAdmin,
	rejectClaimByAdmin
} = require("../controllers/claimController");

const router = express.Router();

router.get("/predictions", protect.required, protect.insurer, getAdminPredictions);
router.get("/claims", protect.required, protect.insurer, listPendingClaimsForAdmin);
router.get("/claims/all", protect.required, protect.insurer, listAllClaims);
router.post("/claim/approve", protect.required, protect.insurer, approveClaimByAdmin);
router.post("/claim/reject", protect.required, protect.insurer, rejectClaimByAdmin);
router.patch("/claims/:claimId/approve", protect.required, protect.insurer, approveClaimByAdmin);
router.patch("/claims/:claimId/reject", protect.required, protect.insurer, rejectClaimByAdmin);

module.exports = router;