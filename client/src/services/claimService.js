import { api } from "./apiClient.js";

function normalizeClaim(claim = {}) {
  return {
    ...claim,
    risk_score: Number(claim?.risk_score ?? claim?.riskScore ?? 0),
    fraud_score: Number(claim?.fraud_score ?? claim?.fraudScore ?? 0),
    trigger_type: claim?.trigger_type || claim?.triggerType || "weather",
    payout_amount: Number(claim?.payout_amount ?? claim?.payoutAmount ?? claim?.amount ?? 0),
    wallet_balance: Number(claim?.wallet_balance ?? claim?.walletBalance ?? 0)
  };
}

function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function autoCreateClaim() {
  const { data } = await api.post("/claim/auto", {}, { headers: authHeaders() });
  console.log("API response:", data);
  return {
    ...data,
    claim: data?.claim ? normalizeClaim(data.claim) : null
  };
}

export async function getMyClaims() {
  const { data } = await api.get("/claim/my", { headers: authHeaders() });
  const claims = Array.isArray(data?.claims) ? data.claims.map(normalizeClaim) : [];
  console.log("API response:", claims);
  return claims;
}

export async function getAllClaims(params = {}) {
  const { data } = await api.get("/claim/all", { headers: authHeaders(), params });
  const claims = Array.isArray(data?.claims) ? data.claims.map(normalizeClaim) : [];
  return {
    claims,
    pagination: data?.pagination || null
  };
}

export async function getAdminClaims(params = {}) {
  const { data } = await api.get("/admin/claims", { headers: authHeaders(), params });
  const claims = Array.isArray(data?.claims) ? data.claims.map(normalizeClaim) : [];
  return {
    claims,
    pagination: data?.pagination || null
  };
}

export async function approveClaimByAdmin(claimId, reason = "") {
  const { data } = await api.patch(
    `/admin/claims/${claimId}/approve`,
    { claim_id: claimId, claimId, reason },
    { headers: authHeaders() }
  );

  return {
    ...data,
    claim: data?.claim ? normalizeClaim(data.claim) : null
  };
}

export async function rejectClaimByAdmin(claimId, reason = "") {
  const { data } = await api.patch(
    `/admin/claims/${claimId}/reject`,
    { claim_id: claimId, claimId, reason },
    { headers: authHeaders() }
  );

  return {
    ...data,
    claim: data?.claim ? normalizeClaim(data.claim) : null
  };
}

export async function redeemClaimNow(claimId = null) {
  const payload = claimId ? { claim_id: claimId, claimId } : {};
  const { data } = await api.post("/claim/request", payload, { headers: authHeaders() });
  console.log("API response:", data);
  return {
    ...data,
    claim: data?.claim ? normalizeClaim(data.claim) : null
  };
}

export async function requestClaimApproval(claimId = null) {
  const payload = claimId ? { claim_id: claimId, claimId } : {};
  const { data } = await api.post("/claim/request", payload, { headers: authHeaders() });
  return {
    ...data,
    claim: data?.claim ? normalizeClaim(data.claim) : null
  };
}

