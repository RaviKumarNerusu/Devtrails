import { api } from "./apiClient.js";

export async function createOrUpdatePolicy(payload = {}) {
  const { data } = await api.post("/policy/create", payload);
  return data?.policy;
}

export async function getPolicyByUserId(userId) {
  const { data } = await api.get(`/policy/${userId}`);
  return data?.policy || null;
}

export async function calculateDynamicPremium(payload = {}) {
  const { data } = await api.post("/premium/calculate", payload);
  return data;
}

export async function runAutomationTriggers() {
  const { data } = await api.post("/trigger/run", {});
  return data;
}

export async function getTriggerStatus() {
  const { data } = await api.get("/trigger/status");
  return data;
}

