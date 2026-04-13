const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getDashboardSummary, getInsurerAnalytics } = require("../controllers/dashboardController");

const router = express.Router();

router.get("/summary", protect.required, getDashboardSummary);
router.get("/insurer-analytics", protect.required, protect.insurer, getInsurerAnalytics);

module.exports = router;
