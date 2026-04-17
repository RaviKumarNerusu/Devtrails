const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
	createTicket,
	getMyTickets,
	getAllTickets,
	updateTicketStatus,
	replyToTicket
} = require("../controllers/supportController");

const router = express.Router();

router.post("/", protect.required, createTicket);
router.get("/my", protect.required, getMyTickets);
router.get("/all", protect.required, protect.insurer, getAllTickets);
router.post("/reply", protect.required, protect.insurer, replyToTicket);
router.patch("/:ticketId/status", protect.required, protect.insurer, updateTicketStatus);

module.exports = router;

