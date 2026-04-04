const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createPolicy,
  getPolicyByUser,
  calculatePremiumEndpoint,
  runTriggerEndpoint
} = require("../controllers/policyController");

const router = express.Router();

router.post("/create", protect.required, createPolicy);
router.get("/:userId", protect.required, getPolicyByUser);
router.post("/premium/calculate", protect.required, calculatePremiumEndpoint);
router.post("/trigger/run", protect.required, runTriggerEndpoint);

module.exports = router;

