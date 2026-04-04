import { api } from "./apiClient.js";

export async function createSupportTicket({ type, message, rating }) {
  const payload = {
    type,
    message
  };
  if (rating !== undefined && rating !== null && rating !== "") {
    payload.rating = rating;
  }
  const { data } = await api.post("/support", payload);
  return data?.ticket;
}

export async function getMySupportTickets() {
  const { data } = await api.get("/support/my");
  return data?.items || [];
}

