const express = require("express");
const { addFavorite, listFavorites } = require("../controllers/favoriteController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect.required, listFavorites);
router.post("/", protect.required, addFavorite);

module.exports = router;

