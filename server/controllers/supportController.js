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

async function getAllTickets(req, res) {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const status = String(req.query?.status || "").toLowerCase().trim();
  const filter = {};
  if (["pending", "resolved"].includes(status)) {
    filter.status = status;
  }

  const tickets = await SupportTicket.find(filter)
    .populate("userId", "name email role")
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, { items: tickets }, "All tickets fetched");
}

async function updateTicketStatus(req, res) {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const ticketId = String(req.params?.ticketId || "").trim();
  if (!ticketId) {
    res.status(400);
    throw new Error("ticketId is required");
  }

  const status = String(req.body?.status || "").toLowerCase().trim();
  if (!["pending", "resolved"].includes(status)) {
    res.status(400);
    throw new Error("Invalid status");
  }

  const updated = await SupportTicket.findByIdAndUpdate(
    ticketId,
    { $set: { status } },
    { new: true, runValidators: true }
  )
    .populate("userId", "name email role")
    .lean();

  if (!updated) {
    res.status(404);
    throw new Error("Ticket not found");
  }

  return sendSuccess(res, { ticket: updated }, "Ticket status updated");
}

async function replyToTicket(req, res) {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const ticketId = String(req.body?.ticketId || req.body?.ticket_id || "").trim();
  const reply = String(req.body?.reply || "").trim();
  const status = String(req.body?.status || "pending").toLowerCase().trim();

  if (!ticketId) {
    res.status(400);
    throw new Error("ticketId is required");
  }

  if (!reply || reply.length < 2) {
    res.status(400);
    throw new Error("Reply is required");
  }

  if (!["pending", "resolved"].includes(status)) {
    res.status(400);
    throw new Error("Invalid status");
  }

  const updated = await SupportTicket.findByIdAndUpdate(
    ticketId,
    {
      $set: {
        adminReply: reply,
        adminReplyAt: new Date(),
        adminReplyBy: userId,
        status
      }
    },
    { new: true, runValidators: true }
  )
    .populate("userId", "name email role")
    .populate("adminReplyBy", "name email role")
    .lean();

  if (!updated) {
    res.status(404);
    throw new Error("Ticket not found");
  }

  return sendSuccess(res, { ticket: updated }, "Reply sent successfully");
}

module.exports = {
  createTicket: asyncHandler(createTicket),
  getMyTickets: asyncHandler(getMyTickets),
  getAllTickets: asyncHandler(getAllTickets),
  updateTicketStatus: asyncHandler(updateTicketStatus),
  replyToTicket: asyncHandler(replyToTicket)
};

