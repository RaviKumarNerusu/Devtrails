const express = require("express");
const { getCityWeather } = require("../controllers/weatherController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// If the user is logged in, we save search history.
router.get("/:city", protect.optional, getCityWeather);

module.exports = router;

