import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext.jsx";

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loadingPlanId, setLoadingPlanId] = React.useState("");
  const [error, setError] = React.useState("");
  const role = String(user?.role || "").toLowerCase();
  const isAdminView = role === "admin" || role === "insurer";

  if (isAdminView) {
    return (
      <div className="card card-glass shadow-sm">
        <div className="card-body">
          <h2 className="mb-2">Admin account detected</h2>
          <p className="text-muted mb-3">
            Plan purchase is a partner flow. As admin, use analytics and claims control panels for platform oversight.
          </p>
          <div className="d-flex gap-2">
            <button className="btn btn-primary" onClick={() => navigate("/analytics")}>Go to Analytics</button>
            <button className="btn btn-outline-secondary" onClick={() => navigate("/claims")}>Open Claims Control</button>
          </div>
        </div>
      </div>
    );
  }

  const handleSelect = async (planId) => {
    setError("");
    setLoadingPlanId(planId);
    localStorage.setItem("selected_plan_id", planId);

    navigate("/payment");
    setLoadingPlanId("");
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

