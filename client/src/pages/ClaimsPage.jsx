import React, { useEffect, useState } from "react";
import { autoCreateClaim, getAllClaims, getMyClaims, requestClaimApproval } from "../services/claimService.js";
import { getPolicyByUserId } from "../services/policyService.js";
import { useAuth } from "../authContext.jsx";
import ClaimTimeline from "../components/ClaimTimeline.jsx";

function triggerLabel(claim) {
  const raw = String(claim?.trigger_type || claim?.triggerType || "rain").toLowerCase();
  const labels = {
    weather: "Rain",
    event: "Social",
    rain: "Rain",
    heat: "Heat",
    pollution: "Pollution",
    flood: "Flood",
    social: "Social"
  };
  return labels[raw] || raw.toUpperCase();
}

export default function ClaimsPage() {
  const { user } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const isAdminView = role === "admin" || role === "insurer";
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [policyActive, setPolicyActive] = useState(false);

  const loadClaims = async (isPolicyActive) => {
    try {
      if (isAdminView) {
        const result = await getAllClaims({ page: 1, limit: 100 });
        setClaims(result.claims || []);
        return;
      }
      if (isPolicyActive) {
        // Ensure today's claim record exists only for users with active policy.
        await autoCreateClaim();
      }
      const items = await getMyClaims();
      setClaims(items);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load claims");
    }
  };

  const loadPolicy = async () => {
    if (isAdminView) {
      setPolicyActive(true);
      return true;
    }
    if (!user?.id) return;
    try {
      const policy = await getPolicyByUserId(user.id);
      setPolicyActive(Boolean(policy?.isActive));
      return Boolean(policy?.isActive);
    } catch {
      setPolicyActive(false);
      return false;
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const isPolicyActive = await loadPolicy();
        await loadClaims(isPolicyActive);
      } catch (err) {
        setError(err.message || "Failed to load claims");
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, isAdminView]);

  const handleCheckEligibility = async () => {
    setChecking(true);
    setError("");
    try {
      if (!policyActive) {
        setError("No active policy. Take policy to recover payout.");
        return;
      }
      await autoCreateClaim();
      await loadClaims(true);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to check claim eligibility");
    } finally {
      setChecking(false);
    }
  };

  const handleRequestClaim = async () => {
    setRequesting(true);
    setError("");
    try {
      if (!policyActive) {
        setError("No active policy. Take policy to recover payout.");
        return;
      }
      await requestClaimApproval(eligibleClaim?._id || null);
      await loadClaims(true);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to request claim");
    } finally {
      setRequesting(false);
    }
  };

  const eligibleClaim = claims.find((c) => String(c.status || "").toLowerCase() === "eligible");

  function statusBadgeClass(status) {
    const key = String(status || "").toLowerCase();
    if (key === "paid") return "text-bg-success";
    if (key === "approved") return "text-bg-success";
    if (key === "pending_approval") return "text-bg-primary";
    if (key === "claimed") return "text-bg-primary";
    if (key === "eligible") return "text-bg-warning";
    if (key === "not_eligible") return "text-bg-secondary";
    if (key === "rejected") return "text-bg-danger";
    return "text-bg-secondary";
  }

  function statusLabel(status) {
    const key = String(status || "eligible").toLowerCase();
    if (key === "eligible") return "🟡 eligible";
    if (key === "not_eligible") return "⚪ not eligible";
    if (key === "pending_approval") return "🔵 pending approval";
    if (key === "claimed") return "🔵 claimed";
    if (key === "approved") return "🟢 approved";
    if (key === "paid") return "💸 paid";
    if (key === "rejected") return "🔴 rejected";
    return key;
  }

  if (loading) return <div>Loading claims...</div>;

  const totalClaims = claims.length;
  const approvedClaims = claims.filter((c) => ["approved", "paid"].includes(String(c.status || "").toLowerCase())).length;
  const pendingReviewClaims = claims.filter((c) => Boolean(c.requiresAdminReview)).length;
  const totalPayout = claims.reduce((sum, c) => sum + Number(c?.payout_amount ?? c?.payoutAmount ?? c?.amount ?? 0), 0);
  const pendingClaim = claims.find((c) => String(c.status || "").toLowerCase() === "pending_approval");

  return (
    <div className="claims-page">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0">{isAdminView ? "Claims Control Center" : "Claims"}</h2>
        {isAdminView ? null : (
          <button className="btn btn-outline-primary" onClick={handleCheckEligibility} disabled={checking || !policyActive}>
            {checking ? "Checking..." : "Check eligibility"}
          </button>
        )}
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {isAdminView ? (
        <div className="card card-glass shadow-sm mb-3">
          <div className="card-body">
            <div className="row g-3 small">
              <div className="col-md-3">
                <div className="text-muted">Total claims</div>
                <div className="fw-semibold fs-5">{totalClaims}</div>
              </div>
              <div className="col-md-3">
                <div className="text-muted">Approved</div>
                <div className="fw-semibold fs-5">{approvedClaims}</div>
              </div>
              <div className="col-md-3">
                <div className="text-muted">Requires review</div>
                <div className="fw-semibold fs-5">{pendingReviewClaims}</div>
              </div>
              <div className="col-md-3">
                <div className="text-muted">Total payout</div>
                <div className="fw-semibold fs-5">₹{Number(totalPayout).toFixed(0)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!isAdminView && !policyActive ? (
        <div className="alert alert-warning d-flex justify-content-between align-items-center" role="alert">
          <div>
            <div className="fw-semibold">No Active Policy</div>
            <div className="small">Select a plan to receive payouts</div>
          </div>
          <a href="/plans" className="btn btn-sm btn-warning">
            Select Plan
          </a>
        </div>
      ) : null}

      {!isAdminView && policyActive && eligibleClaim ? (
        <div className="alert alert-success d-flex justify-content-between align-items-center" role="alert">
          <div>
            <div className="fw-semibold">Claim Available!</div>
            <div className="small">
              Trigger conditions matched in {eligibleClaim.city || "your city"}. Request admin approval to process payout.
            </div>
          </div>
          <button className="btn btn-success" onClick={handleRequestClaim} disabled={requesting}>
            {requesting ? "Requesting..." : "Request Claim"}
          </button>
        </div>
      ) : !isAdminView && policyActive && pendingClaim ? (
        <div className="alert alert-info claims-neutral-alert" role="alert">
          Claim is waiting for admin approval.
        </div>
      ) : !isAdminView && policyActive ? (
        <div className="alert alert-secondary claims-neutral-alert" role="alert">
          Not Eligible Today
        </div>
      ) : null}

      {claims.length === 0 ? (
        <div className="alert alert-secondary claims-neutral-alert">Daily claim records will appear after profile and plan setup.</div>
      ) : (
        <div className="row g-3">
          {claims.map((c) => (
            <div className="col-md-6" key={c._id}>
              <div className="card card-glass shadow-sm h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between mb-2">
                    <div className="fw-semibold">{c.city || "-"}</div>
                    <span className={`badge text-capitalize ${statusBadgeClass(c.status)}`}>{statusLabel(c.status)}</span>
                  </div>
                  <div className="small text-muted claim-meta mb-2">
                    Rain: {Number(c.rainMm || 0).toFixed(1)} mm · Risk: {c.riskLevel || "-"} · Amount: ₹
                    {Number((c.amount ?? c.payoutAmount) || 0).toFixed(0)}
                  </div>
                  <div className="small text-muted claim-meta mb-2">
                    Risk Score: {c?.risk_score ?? c?.riskScore ?? "N/A"} · Fraud Score: {c?.fraud_score ?? c?.fraudScore ?? "N/A"}
                  </div>
                  <div className="small text-muted claim-meta mb-2">
                    Status: {c?.status || "N/A"} · Payout: ₹{Number(c?.payout_amount ?? c?.payoutAmount ?? 0).toFixed(0)}
                  </div>
                  <div className="small text-muted claim-meta mb-2">Trigger: {triggerLabel(c)}</div>
                  {isAdminView ? (
                    <div className="small text-muted claim-meta mb-2">Review Required: {c?.requiresAdminReview ? "Yes" : "No"}</div>
                  ) : null}
                  {c?.fraud_reason ? (
                    <div className="small text-muted claim-meta mb-2">Fraud reason: {c.fraud_reason}</div>
                  ) : null}
                  <ClaimTimeline claim={c} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

