import { api } from "./apiClient.js";

export async function getDashboardSummary() {
  const { data } = await api.get("/dashboard/summary");
  return data || null;
}
