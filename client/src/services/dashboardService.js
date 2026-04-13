import { api } from "./apiClient.js";

function normalizeSummary(data = {}) {
  return {
    ...data,
    user: data?.user
      ? {
          ...data.user,
          wallet_balance: Number(data.user.wallet_balance ?? data.user.walletBalance ?? 0),
          risk_score: Number(data.user.risk_score ?? data.user.riskScore ?? 0)
        }
      : null,
    policy: data?.policy
      ? {
          ...data.policy,
          weekly_premium: Number(data.policy.weekly_premium ?? data.policy.weeklyPremium ?? 0)
        }
      : null,
    claim: data?.claim
      ? {
          ...data.claim,
          risk_score: Number(data.claim.risk_score ?? data.claim.riskScore ?? 0),
          fraud_score: Number(data.claim.fraud_score ?? data.claim.fraudScore ?? 0),
          payout_amount: Number(data.claim.payout_amount ?? data.claim.payoutAmount ?? 0)
        }
      : null
  };
}

export async function getDashboardSummary() {
  const { data } = await api.get("/dashboard/summary");
  const summary = normalizeSummary(data || {});
  console.log("API response:", summary);
  return summary;
}

export async function getInsurerAnalytics() {
  const { data } = await api.get("/dashboard/insurer-analytics");
  console.log("API response:", data);
  return data || null;
}
