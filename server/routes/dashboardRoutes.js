const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getDashboardSummary } = require("../controllers/dashboardController");

const router = express.Router();

router.get("/summary", protect.required, getDashboardSummary);

module.exports = router;
