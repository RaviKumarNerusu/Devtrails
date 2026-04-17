import React, { useEffect, useMemo, useState } from "react";
import { getInsurerAnalytics } from "../services/dashboardService.js";
import { getAdminClaims } from "../services/claimService.js";

function formatDateKey(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [insurerData, claimRes] = await Promise.all([
          getInsurerAnalytics(),
          getAdminClaims({ page: 1, limit: 300 })
        ]);

        setAnalytics(insurerData || null);
        setClaims(claimRes?.claims || []);
      } catch (err) {
        setError(err?.message || "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const regionWiseClaims = useMemo(() => {
    const map = claims.reduce((acc, claim) => {
      const city = String(claim.city || "Unknown");
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(map)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [claims]);

  const claimTrends = useMemo(() => {
    const map = claims.reduce((acc, claim) => {
      const key = formatDateKey(claim.createdAt || claim.date);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(map)
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-10);
  }, [claims]);

  if (loading) return <div>Loading analytics...</div>;
  if (error) return <div className="alert alert-danger">{error}</div>;

  return (
    <div>
      <h2 className="h4 mb-3">Admin Analytics</h2>
      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <div className="card admin-metric-card h-100">
            <div className="card-body">
              <div className="metric-label">Next Week Risk</div>
              <div className="metric-value">{Number(analytics?.next_week_risk || 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card admin-metric-card h-100">
            <div className="card-body">
              <div className="metric-label">Loss Ratio</div>
              <div className="metric-value">{(Number(analytics?.lossRatio || 0) * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card admin-metric-card h-100">
            <div className="card-body">
              <div className="metric-label">Total Claims</div>
              <div className="metric-value">{Number(analytics?.totalClaims || claims.length)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card admin-panel-card h-100">
            <div className="card-body">
              <h5 className="mb-3">Region-wise Claims</h5>
              {regionWiseClaims.length === 0 ? (
                <div className="text-muted small">No region data available.</div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {regionWiseClaims.map((item) => (
                    <div key={item.city} className="d-flex justify-content-between small border-bottom pb-2">
                      <span>{item.city}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card admin-panel-card h-100">
            <div className="card-body">
              <h5 className="mb-3">Claim Trends</h5>
              {claimTrends.length === 0 ? (
                <div className="text-muted small">No trend data available.</div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {claimTrends.map((item) => (
                    <div key={item.day} className="d-flex justify-content-between small border-bottom pb-2">
                      <span>{item.day}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
