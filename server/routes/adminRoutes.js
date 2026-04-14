const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getAdminPredictions } = require("../controllers/dashboardController");

const router = express.Router();

router.get("/predictions", protect.required, protect.insurer, getAdminPredictions);

module.exports = router;