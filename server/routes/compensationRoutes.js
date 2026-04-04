const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getTodayCompensation, listPayouts, triggerPayout, calculatePayoutPreview } = require("../controllers/compensationController");

const router = express.Router();

router.get("/today", protect.required, getTodayCompensation);
router.get("/payouts", protect.required, listPayouts);
router.post("/payout", protect.required, triggerPayout);
router.post("/payout/calculate", protect.required, calculatePayoutPreview);

module.exports = router;

