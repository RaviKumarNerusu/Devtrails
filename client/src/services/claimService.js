import { api } from "./apiClient.js";

function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function autoCreateClaim() {
  const { data } = await api.post("/claim/auto", {}, { headers: authHeaders() });
  return data;
}

export async function getMyClaims() {
  const { data } = await api.get("/claim/my", { headers: authHeaders() });
  return Array.isArray(data?.claims) ? data.claims : [];
}

export async function redeemClaimNow(claimId = null) {
  const payload = claimId ? { claimId } : {};
  const { data } = await api.post("/claim/redeem", payload, { headers: authHeaders() });
  return data;
}

