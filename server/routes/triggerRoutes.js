const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { runTriggerEndpoint, getTriggerStatus } = require("../controllers/policyController");

const router = express.Router();

router.post("/run", protect.required, runTriggerEndpoint);
router.get("/status", protect.required, getTriggerStatus);

module.exports = router;

