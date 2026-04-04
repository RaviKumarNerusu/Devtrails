const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { calculatePremiumEndpoint } = require("../controllers/policyController");

const router = express.Router();

router.post("/calculate", protect.required, calculatePremiumEndpoint);

module.exports = router;

