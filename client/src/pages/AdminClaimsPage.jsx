import React, { useEffect, useMemo, useState } from "react";
import {
  approveClaimByAdmin,
  getAdminClaims,
  rejectClaimByAdmin
} from "../services/claimService.js";

function formatScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "N/A";
  return num.toFixed(2);
}

export default function AdminClaimsPage() {
  const PAGE_SIZE = 12;
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState("");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending_approval");
  const [triggerFilter, setTriggerFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 2200);
  };

  const loadClaims = async () => {
    const result = await getAdminClaims({ page: 1, limit: 200 });
    setClaims(result?.claims || []);
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        await loadClaims();
      } catch (err) {
        setError(err?.message || "Failed to load claims");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const actionableClaims = useMemo(() => {
    return claims.filter((claim) => {
      const status = String(claim.status || "").toLowerCase();
      return status === "pending_approval" || status === "pending" || status === "eligible";
    });
  }, [claims]);

  const filteredClaims = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    return claims.filter((claim) => {
      const status = String(claim.status || "").toLowerCase();
      const trigger = String(claim.trigger_type || claim.triggerType || "rain").toLowerCase();
      const name = String(claim?.userId?.name || "").toLowerCase();
      const email = String(claim?.userId?.email || "").toLowerCase();

      const statusMatch = statusFilter === "all"
        ? true
        : statusFilter === "pending_approval"
          ? (status === "pending_approval" || status === "pending" || status === "eligible")
          : status === statusFilter;
      const triggerMatch = triggerFilter === "all" ? true : trigger === triggerFilter;
      const searchMatch = !q || name.includes(q) || email.includes(q) || String(claim.fraud_reason || "").toLowerCase().includes(q);

      return statusMatch && triggerMatch && searchMatch;
    });
  }, [claims, searchText, statusFilter, triggerFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredClaims.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pagedClaims = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredClaims.slice(start, start + PAGE_SIZE);
  }, [filteredClaims, currentPage]);

  const triggerOptions = useMemo(() => {
    const set = new Set(
      claims.map((claim) => String(claim.trigger_type || claim.triggerType || "rain").toLowerCase())
    );
    return ["all", ...Array.from(set).sort()];
  }, [claims]);

  const onApprove = async (claimId) => {
    setActioningId(claimId);
    setError("");

    const previousClaim = claims.find((item) => String(item._id) === String(claimId));
    setClaims((prev) =>
      prev.map((item) =>
        String(item._id) === String(claimId)
          ? {
              ...item,
              status: "approved",
              requiresAdminReview: false,
              adminDecision: "approved"
            }
          : item
      )
    );

    try {
      await approveClaimByAdmin(claimId, "approved_from_admin_claims_page");
      showToast("Claim Approved", "success");
    } catch (err) {
      if (previousClaim) {
        setClaims((prev) => prev.map((item) => (String(item._id) === String(claimId) ? previousClaim : item)));
      }
      setError(err?.message || "Failed to approve claim");
      showToast("Failed to approve claim", "danger");
    } finally {
      setActioningId("");
    }
  };

  const onReject = async (claimId) => {
    setActioningId(claimId);
    setError("");

    const previousClaim = claims.find((item) => String(item._id) === String(claimId));
    setClaims((prev) =>
      prev.map((item) =>
        String(item._id) === String(claimId)
          ? {
              ...item,
              status: "rejected",
              requiresAdminReview: false,
              adminDecision: "rejected"
            }
          : item
      )
    );

    try {
      await rejectClaimByAdmin(claimId, "rejected_from_admin_claims_page");
      showToast("Claim Rejected", "success");
    } catch (err) {
      if (previousClaim) {
        setClaims((prev) => prev.map((item) => (String(item._id) === String(claimId) ? previousClaim : item)));
      }
      setError(err?.message || "Failed to reject claim");
      showToast("Failed to reject claim", "danger");
    } finally {
      setActioningId("");
    }
  };

  if (loading) return <div>Loading claims queue...</div>;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h4 mb-0">Claims Approval System</h2>
        <span className="badge text-bg-warning">Pending: {actionableClaims.length}</span>
      </div>

      <div className="card admin-panel-card mb-3">
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label small text-muted">Search user or reason</label>
              <input
                className="form-control"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(1);
                }}
                placeholder="Name, email, fraud reason"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small text-muted">Status</label>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="pending_approval">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All statuses</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label small text-muted">Trigger type</label>
              <select
                className="form-select"
                value={triggerFilter}
                onChange={(e) => {
                  setTriggerFilter(e.target.value);
                  setPage(1);
                }}
              >
                {triggerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "All triggers" : option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="card admin-panel-card">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>User</th>
                <th>Trigger type</th>
                <th>Risk score</th>
                <th>Fraud score</th>
                <th>Confidence score</th>
                <th>Fraud reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedClaims.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">
                    No claims found for selected filters.
                  </td>
                </tr>
              ) : (
                pagedClaims.map((claim) => {
                  const claimId = String(claim._id || "");
                  const status = String(claim.status || "").toLowerCase();
                  const canModerate = ["pending_approval", "pending", "eligible", "claimed"].includes(status);

                  return (
                    <tr key={claimId} className={Number(claim.fraud_score || 0) >= 0.7 ? "table-danger" : ""}>
                      <td>
                        <div className="fw-semibold">{claim?.userId?.name || "Unknown user"}</div>
                        <div className="small text-muted">{claim?.userId?.email || "-"}</div>
                      </td>
                      <td>{claim.trigger_type || claim.triggerType || "rain"}</td>
                      <td>{formatScore(claim.risk_score)}</td>
                      <td>{formatScore(claim.fraud_score)}</td>
                      <td>{formatScore(claim.confidence_score)}</td>
                      <td className="small" title={claim.fraud_reason || "No explicit reason"}>
                        {claim.fraud_reason || "No explicit reason"}
                      </td>
                      <td>
                        <span className="badge text-bg-secondary text-capitalize">{status || "unknown"}</span>
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            disabled={!canModerate || actioningId === claimId}
                            onClick={() => onApprove(claimId)}
                          >
                            {actioningId === claimId ? "Approving..." : "Approve Claim"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={!canModerate || actioningId === claimId}
                            onClick={() => onReject(claimId)}
                          >
                            {actioningId === claimId ? "Rejecting..." : "Reject Claim"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="card-footer bg-transparent d-flex justify-content-between align-items-center">
          <span className="small text-muted">
            Showing {pagedClaims.length} of {filteredClaims.length} filtered claims
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

      {toast.show ? (
        <div className="position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1080 }}>
          <div className={`alert alert-${toast.type} shadow-sm mb-0`} role="alert">
            {toast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}
