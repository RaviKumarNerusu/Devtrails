import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../services/apiClient.js";

export default function AiRiskResultPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/compensation/today");
        setResult(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not fetch AI risk result.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleContinue = () => {
    navigate("/plans");
  };

  if (loading) return <div>Loading today&apos;s risk assessment...</div>;
  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!result) {
    return (
      <div className="alert alert-warning" role="alert">
        No risk assessment available. Please complete onboarding first.
      </div>
    );
  }

  const payout = Number(result.payoutAmount || 0);
  const risk = result.riskLevel || "UNKNOWN";

  return (
    <div className="row">
      <div className="col-lg-7">
        <h2 className="mb-2">AI risk result for today</h2>
        <p className="text-muted mb-4">
          Based on live rainfall forecasts near your pincode, we estimate how likely your earnings are to be disrupted.
        </p>
        <div className="card card-glass shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 className="card-title mb-0">
                  {result.city} – {Number(result.rainMm || 0).toFixed(1)} mm expected
                </h5>
                <span className="badge bg-primary mt-2">Risk level: {risk}</span>
              </div>
              <div className="text-end">
                {payout > 0 ? (
                  <>
                    <div className="fw-semibold text-success">Payout triggered</div>
                    <div className="text-success">
                      Amount: <strong>₹{payout.toFixed(0)}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="fw-semibold">No payout today</div>
                    <div className="text-muted small">Rain below protection level</div>
                  </>
                )}
              </div>
            </div>
            <p className="small text-muted mb-0">
              Threshold set at {Number(result.rainThresholdMm || 0)} mm. Disruption ratio is {(() => {
                const t = Number(result.rainThresholdMm || 0);
                if (!t) return "--";
                return (Number(result.rainMm || 0) / t).toFixed(2);
              })()}.
            </p>
          </div>
        </div>
        <button className="btn btn-primary me-2" onClick={handleContinue}>
          Continue to weekly plans
        </button>
        <Link to="/dashboard" className="btn btn-outline-secondary">
          Skip to dashboard
        </Link>
      </div>
      <div className="col-lg-5 mt-4 mt-lg-0">
        <div className="card card-glass shadow-sm">
          <div className="card-body">
            <h5 className="card-title mb-3">How we calculate this</h5>
            <ul className="small mb-0">
              <li>We pull hyper-local rainfall forecasts for your working city and pincode.</li>
              <li>We model the share of work-time impacted by heavy rain.</li>
              <li>We multiply this by your declared average daily earning.</li>
              <li>We then apply a parametric payout schedule with caps to avoid over-compensation.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

