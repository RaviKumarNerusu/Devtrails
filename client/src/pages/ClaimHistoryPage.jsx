import React, { useEffect, useState } from "react";
import { autoCreateClaim, getMyClaims } from "../services/claimService.js";
import { getPolicyByUserId } from "../services/policyService.js";
import { useAuth } from "../authContext.jsx";

export default function ClaimHistoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [policyActive, setPolicyActive] = useState(false);

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

  function triggerLabel(claim) {
    const rawList = claim?.trigger_types ?? claim?.trigger_type ?? claim?.triggerType ?? [];
    const list = Array.isArray(rawList) ? rawList : [rawList];
    const normalized = [...new Set(list.map((item) => String(item || "").toLowerCase()).filter(Boolean))];
    const labels = {
      weather: "Rain",
      event: "Social",
      rain: "Rain",
      heat: "Heat",
      pollution: "Pollution",
      flood: "Flood",
      social: "Social"
    };
    const names = normalized.map((item) => labels[item] || item.toUpperCase());
    return names.length > 0 ? names.join(" + ") : "None";
  }

  function formatThresholdActual(claim) {
    const used = claim?.threshold_used || {};
    const observed = claim?.factor_observations || {};

    const rain = `Rain ${Number(claim?.rainMm || 0).toFixed(1)}/${Number(used?.rainfall_threshold ?? claim?.threshold ?? 0).toFixed(1)}`;
    const heat = `Heat ${Number(observed?.temperature || 0).toFixed(1)}/${Number(used?.heat_threshold || 0).toFixed(1)}`;
    const aqi = `AQI ${Number(observed?.aqi || 0).toFixed(0)}/${Number(used?.pollution_threshold || 0).toFixed(0)}`;
    const flood = `Flood ${Number(claim?.rainMm || 0).toFixed(1)}/${Number(used?.flood_threshold || 0).toFixed(1)}`;

    return [rain, heat, aqi, flood].join(" | ");
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        let hasPolicy = false;
        if (user?.id) {
          try {
            const policy = await getPolicyByUserId(user.id);
            hasPolicy = Boolean(policy?.isActive);
          } catch {
            hasPolicy = false;
          }
        }
        setPolicyActive(hasPolicy);

        if (hasPolicy) {
          await autoCreateClaim();
        }

        const claims = await getMyClaims();
        setItems(claims || []);
      } catch (err) {
        setError(err?.response?.data?.message || err.message || "Failed to load claims");
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id]);

  if (loading) return <div>Loading claim history...</div>;

  const filteredItems = items.filter((c) => {
    if (filter === "all") return true;
    return String(c.status || "").toLowerCase() === filter;
  });

  return (
    <div>
      <h2 className="mb-2">Claim history</h2>
      <p className="text-muted mb-4">Track claim lifecycle: not eligible, eligible, pending approval, approved, paid, and rejected.</p>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {[
          ["all", "All"],
          ["not_eligible", "Not eligible"],
          ["eligible", "Eligible"],
          ["pending_approval", "Pending"],
          ["approved", "Approved"],
          ["paid", "Paid"],
          ["rejected", "Rejected"]
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`btn btn-sm ${filter === key ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {!policyActive ? (
        <div className="alert alert-warning" role="alert">
          No active policy. Take policy to recover payout and start claim history tracking.
        </div>
      ) : null}

      {filteredItems.length === 0 ? (
        <div className="alert alert-secondary" role="alert">
          No claim records found for this filter.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Date</th>
                <th>City</th>
                <th>Triggers</th>
                <th>Actual vs Threshold</th>
                <th>Payout (₹)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((p) => (
                <tr key={p._id}>
                  <td>{new Date(p.date || p.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>{p.city || "-"}</td>
                  <td>{triggerLabel(p)}</td>
                  <td className="small text-muted">{formatThresholdActual(p)}</td>
                  <td>
                    ₹{Number(p.payout_amount || p.payoutAmount || p.amount || 0).toFixed(0)}
                    <div className="small text-muted">Risk: {p?.risk_score ?? p?.riskScore ?? "N/A"} · Fraud: {p?.fraud_score ?? p?.fraudScore ?? "N/A"}</div>
                    <div className="small text-muted">Trigger: {triggerLabel(p)}{p?.fraud_reason ? ` · Reason: ${p.fraud_reason}` : ""}</div>
                  </td>
                  <td>
                    <span className={`badge text-capitalize ${statusBadgeClass(p.status)}`}>
                      {statusLabel(p.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

