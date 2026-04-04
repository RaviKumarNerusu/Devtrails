import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/apiClient.js";

const PLANS = [
  {
    id: "lite",
    name: "Lite Cover",
    pricePerWeek: 49,
    coverage: "Up to ₹500 per heavy-rain day",
    description: "Good for part-time partners who work a few hours daily."
  },
  {
    id: "standard",
    name: "Standard Cover",
    pricePerWeek: 99,
    coverage: "Up to ₹1,000 per heavy-rain day",
    description: "Balanced protection for most full-time gig workers."
  },
  {
    id: "max",
    name: "Max Cover",
    pricePerWeek: 149,
    coverage: "Up to ₹1,500 per heavy-rain day",
    description: "For partners whose income depends heavily on daily rides/orders."
  }
];

export default function PlanSelectionPage() {
  const navigate = useNavigate();
  const [loadingPlanId, setLoadingPlanId] = React.useState("");
  const [error, setError] = React.useState("");

  const handleSelect = async (planId) => {
    setError("");
    setLoadingPlanId(planId);
    localStorage.setItem("selected_plan_id", planId);

    const selected = PLANS.find((plan) => plan.id === planId);
    const validTill = Date.now() + 7 * 24 * 60 * 60 * 1000;

    try {
      await api.post("/plan/activate", {
        name: selected?.name || "Standard Cover",
        validTill
      });

      localStorage.setItem(
        "activePlan",
        JSON.stringify({
          name: selected?.name || "Standard Cover",
          validTill,
          status: "active"
        })
      );

      navigate("/app");
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to activate plan");
    } finally {
      setLoadingPlanId("");
    }
  };

  return (
    <div>
      <h2 className="mb-2">Choose your weekly protection plan</h2>
      <p className="text-muted mb-4">
        Plans renew every 7 days. You can upgrade or downgrade anytime before renewal.
      </p>
      {error ? <div className="alert alert-danger">{error}</div> : null}
      <div className="row g-3">
        {PLANS.map((plan) => (
          <div className="col-md-4" key={plan.id}>
            <div className="card card-glass shadow-sm h-100">
              <div className="card-body d-flex flex-column">
                <h5 className="card-title">{plan.name}</h5>
                <h3 className="mb-1">₹{plan.pricePerWeek}</h3>
                <div className="text-muted small mb-2">per week</div>
                <p className="mb-2">{plan.coverage}</p>
                <p className="small text-muted flex-grow-1">{plan.description}</p>
                <button
                  className="btn btn-primary w-100 mt-2"
                  onClick={() => handleSelect(plan.id)}
                  disabled={loadingPlanId === plan.id}
                >
                  {loadingPlanId === plan.id ? "Activating..." : "Select plan"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

