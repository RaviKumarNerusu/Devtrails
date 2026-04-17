const axios = require("axios");

const GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_SYSTEM_PROMPT =
  "You are Income Guard AI, a helpful professional assistant for parametric insurance. " +
  "Answer in ONE short, natural sentence. " +
  "Focus on protecting worker income from weather or external disruptions. " +
  "Mention weekly pricing and coverage if asked. " +
  "Strictly NO health, life, or vehicle repair talk."

function normalizeReply(text) {
  const raw = String(text || "").trim();
  if (!raw) return "I can help with weather disruption income protection questions.";
  const firstSentence = raw.split(/(?<=[.!?])\s+/)[0];
  return firstSentence || raw;
}

async function askGroq(message) {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("Chatbot is not configured. Missing GROQ_API_KEY.");
    err.statusCode = 503;
    err.errorCode = "CHATBOT_NOT_CONFIGURED";
    throw err;
  }

  try {
    const response = await axios.post(
      GROQ_CHAT_ENDPOINT,
      {
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: process.env.GROQ_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.5
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: Number(process.env.GROQ_API_TIMEOUT_MS || 15000)
      }
    );

    const reply = response?.data?.choices?.[0]?.message?.content;
    return normalizeReply(reply);
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    const upstreamMessage =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      error?.message ||
      "Upstream chatbot request failed";

    const err = new Error(`Chatbot service unavailable: ${upstreamMessage}`);
    err.statusCode = status >= 400 && status < 600 ? 502 : 502;
    err.errorCode = "CHATBOT_UPSTREAM_ERROR";
    throw err;
  }
}

module.exports = {
  askGroq
};
