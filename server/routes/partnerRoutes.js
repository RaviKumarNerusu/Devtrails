const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getProfile, saveProfile } = require("../controllers/partnerController");

const router = express.Router();

router.get("/profile", protect.required, getProfile);
router.post("/profile", protect.required, saveProfile);

module.exports = router;

