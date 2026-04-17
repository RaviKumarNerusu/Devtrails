const express = require("express");
const { chatWithBot } = require("../controllers/chatbotController");

const router = express.Router();

router.post("/", chatWithBot);

module.exports = router;
