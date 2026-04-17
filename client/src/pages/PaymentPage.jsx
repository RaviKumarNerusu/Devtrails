import React, { useEffect, useMemo } from "react";
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
  const [scriptReady, setScriptReady] = React.useState(false);
  const [sessionExpired, setSessionExpired] = React.useState(false);

  const selectedPlan = useMemo(
    () => PLAN_LOOKUP[selectedPlanId] || PLAN_LOOKUP.standard,
    [selectedPlanId]
  );

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  useEffect(() => {
    const handleAuthExpired = () => {
      setSessionExpired(true);
      setError("Session expired. Please login again.");
    };

    window.addEventListener("auth:expired", handleAuthExpired);
    return () => window.removeEventListener("auth:expired", handleAuthExpired);
  }, []);

  useEffect(() => {
    if (window.Razorpay) {
      setScriptReady(true);
      return undefined;
    }

    const script = document.createElement("script");
    script.id = "razorpay-checkout-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => setError("Unable to load Razorpay checkout script");
    document.body.appendChild(script);

    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, []);

  const handleRazorpayPayment = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (!scriptReady || !window.Razorpay) {
        throw new Error("Razorpay checkout is not ready yet");
      }

      const orderResponse = await api.post("/payment/razorpay/order", {
        planId: selectedPlanId,
        name: selectedPlan.name
      });

      const order = orderResponse?.data || orderResponse;
      const keyId = order?.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID;

      if (!keyId) {
        throw new Error("Missing Razorpay key id. Set VITE_RAZORPAY_KEY_ID in the client env.");
      }

      const razorpay = new window.Razorpay({
        key: keyId,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Devtrails",
        description: selectedPlan.name,
        order_id: order.orderId,
        theme: { color: "#0f766e" },
        prefill: {
          name: "Test User",
          email: "test@example.com",
          contact: "9999999999"
        },
        handler: async (response) => {
          const verification = await api.post("/payment/razorpay/verify", {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            planId: selectedPlanId,
            planName: selectedPlan.name
          });

          if (verification?.data?.policy?.isActive) {
            const validTill = Date.now() + 7 * 24 * 60 * 60 * 1000;
            localStorage.setItem(
              "activePlan",
              JSON.stringify({
                name: selectedPlan.name,
                validTill,
                status: "active"
              })
            );
          }

          navigate("/dashboard");
        }
      });

      razorpay.on("payment.failed", (response) => {
        setError(response?.error?.description || "Payment failed");
      });

      razorpay.open();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionExpired) {
    return (
      <div className="row justify-content-center">
        <div className="col-lg-6">
          <div className="alert alert-warning" role="alert">
            Your session expired. Please login again and retry the payment.
          </div>
          <Link to="/login" className="btn btn-primary">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-6">
        <h2 className="mb-2">Razorpay payment</h2>
        <p className="text-muted mb-4">
          This page opens Razorpay test checkout. Use your Razorpay test bank account or test card details here. No real money is charged.
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
        <form onSubmit={handleRazorpayPayment}>
          <div className="mb-3">
            <label className="form-label">Secure checkout</label>
            <input className="form-control" value="Razorpay checkout opens on submit" disabled readOnly />
            <div className="form-text">Use the Razorpay test bank account or test card inside the checkout popup.</div>
          </div>
          <button type="submit" className="btn btn-success w-100" disabled={submitting || !scriptReady}>
            {submitting ? "Processing..." : scriptReady ? "Pay with Razorpay" : "Loading payment..."}
          </button>
        </form>
        <p className="mt-3 mb-0">
          <Link to="/plans">Back to plans</Link>
        </p>
      </div>
    </div>
  );
}

