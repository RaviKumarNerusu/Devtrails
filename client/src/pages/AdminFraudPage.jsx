import React, { useEffect, useMemo, useState } from "react";
import { getAdminClaims } from "../services/claimService.js";

const HIGH_FRAUD_THRESHOLD = 0.7;

function score(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "N/A";
}

export default function AdminFraudPage() {
  const PAGE_SIZE = 10;
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fraudThreshold, setFraudThreshold] = useState(HIGH_FRAUD_THRESHOLD);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await getAdminClaims({ page: 1, limit: 300 });
        setClaims(response?.claims || []);
      } catch (err) {
        setError(err?.message || "Failed to load fraud panel");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const highRiskClaims = useMemo(
    () =>
      claims
        .filter((claim) => {
          const fraudScore = Number(claim.fraud_score || 0);
          const q = searchText.trim().toLowerCase();
          const matchSearch =
            !q ||
            String(claim?.userId?.name || "").toLowerCase().includes(q) ||
            String(claim?.userId?.email || "").toLowerCase().includes(q) ||
            String(claim.fraud_reason || "").toLowerCase().includes(q);
          return fraudScore >= Number(fraudThreshold || HIGH_FRAUD_THRESHOLD) && matchSearch;
        })
        .sort((a, b) => Number(b.fraud_score || 0) - Number(a.fraud_score || 0)),
    [claims, fraudThreshold, searchText]
  );

  const totalPages = Math.max(1, Math.ceil(highRiskClaims.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pagedHighRiskClaims = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return highRiskClaims.slice(start, start + PAGE_SIZE);
  }, [highRiskClaims, currentPage]);

  const suspiciousUsers = useMemo(() => {
    const counter = new Map();

    highRiskClaims.forEach((claim) => {
      const key = claim?.userId?._id || claim?.userId?.email || "unknown";
      const current = counter.get(key) || {
        user: claim?.userId?.name || "Unknown user",
        email: claim?.userId?.email || "-",
        hits: 0,
        maxFraudScore: 0
      };

      current.hits += 1;
      current.maxFraudScore = Math.max(current.maxFraudScore, Number(claim.fraud_score || 0));
      counter.set(key, current);
    });

    return Array.from(counter.values()).sort((a, b) => {
      if (b.hits !== a.hits) return b.hits - a.hits;
      return b.maxFraudScore - a.maxFraudScore;
    });
  }, [highRiskClaims]);

  if (loading) return <div>Loading fraud panel...</div>;
  if (error) return <div className="alert alert-danger">{error}</div>;

  return (
    <div>
      <h2 className="h4 mb-3">Fraud Panel</h2>

      <div className="card admin-panel-card mb-3">
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label small text-muted">Search user or fraud reason</label>
              <input
                className="form-control"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(1);
                }}
                placeholder="Name, email, reason"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small text-muted">Fraud threshold</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                className="form-control"
                value={fraudThreshold}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setFraudThreshold(Number.isFinite(next) ? Math.min(1, Math.max(0, next)) : HIGH_FRAUD_THRESHOLD);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <div className="card admin-metric-card h-100">
            <div className="card-body">
              <div className="metric-label">High Fraud Claims</div>
              <div className="metric-value">{highRiskClaims.length}</div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card admin-metric-card h-100">
            <div className="card-body">
              <div className="metric-label">Suspicious Users</div>
              <div className="metric-value">{suspiciousUsers.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card admin-panel-card mb-3">
        <div className="card-body">
          <h5 className="mb-3">High Fraud Score Claims</h5>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Fraud score</th>
                  <th>Risk score</th>
                  <th>Fraud reason</th>
                </tr>
              </thead>
              <tbody>
                {pagedHighRiskClaims.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-4">
                      No high fraud claims detected.
                    </td>
                  </tr>
                ) : (
                  pagedHighRiskClaims.map((claim) => (
                    <tr key={claim._id} className="table-danger">
                      <td>
                        <div className="fw-semibold">{claim?.userId?.name || "Unknown user"}</div>
                        <div className="small text-muted">{claim?.userId?.email || "-"}</div>
                      </td>
                      <td>{score(claim.fraud_score)}</td>
                      <td>{score(claim.risk_score)}</td>
                      <td className="small">{claim.fraud_reason || "No reason provided"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
            <div className="d-flex justify-content-between align-items-center mt-3">
              <span className="small text-muted">
                Showing {pagedHighRiskClaims.length} of {highRiskClaims.length} high fraud claims
              </span>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                <span className="small align-self-center">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Next
                </button>
              </div>
            </div>
        </div>
      </div>

      <div className="card admin-panel-card">
        <div className="card-body">
          <h5 className="mb-3">Suspicious Users</h5>
          {suspiciousUsers.length === 0 ? (
            <div className="text-muted small">No suspicious users at this time.</div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {suspiciousUsers.map((user) => (
                <div key={`${user.email}-${user.user}`} className="d-flex justify-content-between border-bottom pb-2">
                  <div>
                    <div className="fw-semibold">{user.user}</div>
                    <div className="small text-muted">{user.email}</div>
                  </div>
                  <div className="text-end small">
                    <div>
                      High risk claims: <strong>{user.hits}</strong>
                    </div>
                    <div>
                      Max fraud score: <strong>{user.maxFraudScore.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
