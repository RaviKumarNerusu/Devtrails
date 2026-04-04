import React, { useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../services/apiClient.js";

const PLAN_LOOKUP = {
  lite: { name: "Lite Cover", pricePerWeek: 49 },
  standard: { name: "Standard Cover", pricePerWeek: 99 },
  max: { name: "Max Cover", pricePerWeek: 149 }
};

export default function PaymentPage() {
  const navigate = useNavigate();
  const selectedPlanId = localStorage.getItem("selected_plan_id") || "standard";

  const selectedPlan = useMemo(
    () => PLAN_LOOKUP[selectedPlanId] || PLAN_LOOKUP.standard,
    [selectedPlanId]
  );

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleMockPayment = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      // simulate success (mock gateway)
      await new Promise((res) => setTimeout(res, 1000));

      // Activate plan in backend so payouts are eligible.
      // Even if this fails, we still navigate to keep the demo smooth.
      const validTill = Date.now() + 7 * 24 * 60 * 60 * 1000;
      try {
        await api.post("/plan/activate", { name: selectedPlan.name, validTill });
      } catch {
        // ignore backend activation errors
      }

      localStorage.setItem(
        "activePlan",
        JSON.stringify({
          name: selectedPlan.name,
          validTill,
          status: "active"
        })
      );

      navigate("/app");
    } catch (err) {
      setError("Payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="row justify-content-center">
      <div className="col-lg-6">
        <h2 className="mb-2">Mock payment</h2>
        <p className="text-muted mb-4">
          This screen simulates a payment gateway. No real money is charged; it simply advances the journey.
        </p>
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        <div className="card card-glass shadow-sm mb-3">
          <div className="card-body">
            <h5 className="card-title mb-2">Order summary</h5>
            <p className="mb-1">Plan: {selectedPlan.name}</p>
            <p className="mb-1">Billing cycle: 7 days</p>
            <h4 className="mt-2 mb-0">Total: ₹{selectedPlan.pricePerWeek}</h4>
          </div>
        </div>
        <form onSubmit={handleMockPayment}>
          <div className="mb-3">
            <label className="form-label">Card number (mock)</label>
            <input className="form-control" placeholder="4242 4242 4242 4242" disabled />
            <div className="form-text">Payment is mocked; details are not used.</div>
          </div>
          <button type="submit" className="btn btn-success w-100" disabled={submitting}>
            {submitting ? "Processing..." : "Confirm payment"}
          </button>
        </form>
        <p className="mt-3 mb-0">
          <Link to="/plans">Back to plans</Link>
        </p>
      </div>
    </div>
  );
}

