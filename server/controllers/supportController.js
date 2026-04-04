const SupportTicket = require("../models/SupportTicket");
const { sendSuccess } = require("../utils/responseHandler");
const { asyncHandler } = require("../utils/asyncHandler");

function normalizeType(type) {
  const t = String(type || "").toLowerCase().trim();
  if (!["refund", "payout", "bug"].includes(t)) return null;
  return t;
}

async function createTicket(req, res) {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const { type, message, rating } = req.body || {};
  const normalizedType = normalizeType(type);

  const normalizedMessage = String(message || "").trim();
  if (!normalizedType) {
    res.status(400);
    throw new Error("Invalid ticket type");
  }
  if (!normalizedMessage || normalizedMessage.length < 5) {
    res.status(400);
    throw new Error("Message is required (min 5 chars)");
  }

  const normalizedRating = rating === "" || rating === null || typeof rating === "undefined" ? undefined : Number(rating);
  if (typeof normalizedRating !== "undefined") {
    if (!Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      res.status(400);
      throw new Error("Rating must be between 1 and 5");
    }
  }

  const ticket = await SupportTicket.create({
    userId,
    type: normalizedType,
    message: normalizedMessage,
    status: "pending",
    rating: normalizedRating
  });

  return sendSuccess(res, { ticket }, "Ticket submitted successfully", 201);
}

async function getMyTickets(req, res) {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const tickets = await SupportTicket.find({ userId }).sort({ createdAt: -1 }).lean();
  return sendSuccess(res, { items: tickets }, "Tickets fetched");
}

module.exports = {
  createTicket: asyncHandler(createTicket),
  getMyTickets: asyncHandler(getMyTickets)
};

