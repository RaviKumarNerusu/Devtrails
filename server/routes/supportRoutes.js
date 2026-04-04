const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { createTicket, getMyTickets } = require("../controllers/supportController");

const router = express.Router();

router.post("/", protect.required, createTicket);
router.get("/my", protect.required, getMyTickets);

module.exports = router;

