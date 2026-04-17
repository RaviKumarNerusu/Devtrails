import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../authContext.jsx";
import { getPolicyByUserId } from "../services/policyService.js";

export default function PolicyPage() {
  const { user } = useAuth();
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadPolicy() {
      if (!user?.id) return;
      setLoading(true);
      setError("");
      try {
        const p = await getPolicyByUserId(user.id);
        if (mounted) {
          setPolicy(p);
        }
      } catch (err) {
        if (mounted) {
          setError(err?.response?.data?.message || err.message || "Failed to load policy");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadPolicy();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  if (loading) return <div>Loading policy...</div>;

  return (
    <div className="row justify-content-center">
      <div className="col-lg-8">
        <h2 className="mb-3">Policy Overview</h2>
        <div className="card card-glass shadow-sm">
          <div className="card-body">
            {error ? <div className="alert alert-danger">{error}</div> : null}

            {policy ? (
              <>
                <div className="mb-2">
                  <strong>Status:</strong> {policy.isActive ? "Active" : "Inactive"}
                </div>
                <div className="mb-2">
                  <strong>Location:</strong> {policy.location || "-"}
                </div>
                <div className="mb-2">
                  <strong>Premium:</strong> Rs {Number(policy.dynamicPremium || 0).toFixed(0)}
                </div>
                <div className="text-muted small mb-3">
                  Last updated: {policy.lastUpdated ? new Date(policy.lastUpdated).toLocaleString() : "-"}
                </div>
              </>
            ) : (
              <div className="alert alert-warning">No active policy. Select a plan to create one.</div>
            )}

            <div className="d-flex gap-2">
              <Link to="/plans" className="btn btn-primary">
                Select / Change Plan
              </Link>
              <Link to="/dashboard" className="btn btn-outline-secondary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  );
}

