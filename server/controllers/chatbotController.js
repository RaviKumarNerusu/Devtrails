const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/responseHandler");
const { askGroq } = require("../services/chatbotService");

async function chatWithBot(req, res) {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    res.status(400);
    throw new Error("message is required");
  }

  if (message.length > 600) {
    res.status(400);
    throw new Error("message is too long (max 600 chars)");
  }

  const reply = await askGroq(message);
  return sendSuccess(res, { reply }, "Chatbot reply generated");
}

module.exports = {
  chatWithBot: asyncHandler(chatWithBot)
};
