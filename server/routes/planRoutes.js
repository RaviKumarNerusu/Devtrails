const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { activatePlan } = require("../controllers/planController");

const router = express.Router();

router.post("/activate", protect.required, activatePlan);

module.exports = router;

