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

export async function getAllSupportTickets(status = "") {
  const params = {};
  if (status) params.status = status;
  const { data } = await api.get("/support/all", { params });
  return data?.items || [];
}

export async function updateSupportTicketStatus(ticketId, status) {
  const { data } = await api.patch(`/support/${ticketId}/status`, { status });
  return data?.ticket || null;
}

export async function replySupportTicket({ ticketId, reply, status = "pending" }) {
  const { data } = await api.post("/support/reply", {
    ticketId,
    ticket_id: ticketId,
    reply,
    status
  });
  return data?.ticket || null;
}

