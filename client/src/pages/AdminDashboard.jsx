import React, { useEffect, useMemo, useState } from "react";
import { getInsurerAnalytics } from "../services/dashboardService.js";
import { getAdminClaims } from "../services/claimService.js";

function formatMoney(value) {
  return `Rs ${Number(value || 0).toFixed(0)}`;
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [analyticsData, claimsRes] = await Promise.all([
          getInsurerAnalytics(),
          getAdminClaims({ page: 1, limit: 200 })
        ]);

        setAnalytics(analyticsData || null);
        setClaims(claimsRes?.claims || []);
      } catch (err) {
        setError(err?.message || "Failed to load admin dashboard");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const metrics = useMemo(() => {
    const totalClaims = Number(analytics?.totalClaims || claims.length || 0);
    const approvedClaims = Number(
      analytics?.approvedClaims || claims.filter((item) => String(item.status || "").toLowerCase() === "approved").length
    );
    const pendingClaims = claims.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return ["pending_approval", "pending", "eligible"].includes(status) || Boolean(item.requiresAdminReview);
    }).length;
    const totalPayout = Number(analytics?.totalPayout || 0);
    const lossRatio = Number(analytics?.lossRatio || 0);

    return {
      totalClaims,
      approvedClaims,
      pendingClaims,
      totalPayout,
      lossRatio
    };
  }, [analytics, claims]);

  if (loading) return <div>Loading admin dashboard...</div>;
  if (error) return <div className="alert alert-danger">{error}</div>;

  return (
    <div>
      <div className="row g-3 mb-3">
        <div className="col-md-6 col-xl-3">
          <div className="card admin-metric-card h-100">
            <div className="card-body">
              <div className="metric-label">Total Claims</div>
              <div className="metric-value">{metrics.totalClaims}</div>
            </div>
          </div>
        </div>
        <div className="col-md-6 col-xl-3">
          <div className="card admin-metric-card h-100">
            <div className="card-body">
              <div className="metric-label">Approved Claims</div>
              <div className="metric-value">{metrics.approvedClaims}</div>
            </div>
          </div>
        </div>
        <div className="col-md-6 col-xl-3">
          <div className="card admin-metric-card h-100">
            <div className="card-body">
              <div className="metric-label">Pending Claims</div>
              <div className="metric-value">{metrics.pendingClaims}</div>
            </div>
          </div>
        </div>
        <div className="col-md-6 col-xl-3">
          <div className="card admin-metric-card h-100">
            <div className="card-body">
              <div className="metric-label">Total Payout</div>
              <div className="metric-value">{formatMoney(metrics.totalPayout)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="card admin-panel-card h-100">
            <div className="card-body">
              <h5 className="mb-2">Loss Ratio</h5>
              <div className="display-6 mb-2">{(metrics.lossRatio * 100).toFixed(1)}%</div>
              <p className="text-muted mb-0">
                This represents payout outflow relative to active weekly premiums.
              </p>
            </div>
          </div>
        </div>
        <div className="col-lg-7">
          <div className="card admin-panel-card h-100">
            <div className="card-body">
              <h5 className="mb-3">Quick Status</h5>
              <div className="d-flex flex-column gap-2 small">
                <div>
                  Claims requiring action: <strong>{metrics.pendingClaims}</strong>
                </div>
                <div>
                  Auto flagged for manual review: <strong>{claims.filter((item) => item.requiresAdminReview).length}</strong>
                </div>
                <div>
                  Rejected claims: <strong>{Number(analytics?.rejectedClaims || 0)}</strong>
                </div>
                <div>
                  Next week risk score: <strong>{Number(analytics?.next_week_risk || 0).toFixed(2)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
