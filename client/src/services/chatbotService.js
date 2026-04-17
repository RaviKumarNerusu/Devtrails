import { api } from "./apiClient";

export async function askIncomeGuardAI(message) {
  const { data } = await api.post("/chatbot", { message });
  const reply = String(data?.reply || "").trim();
  if (!reply) {
    return "I can help with weather disruption income protection questions.";
  }
  return reply;
}
