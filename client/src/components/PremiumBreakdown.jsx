import React from "react";

export default function PremiumBreakdown({ breakdown, premium }) {
  if (!breakdown) return null;

  return (
    <div className="card card-glass shadow-sm mt-3">
      <div className="card-body">
        <h6 className="mb-3">Why this premium?</h6>
        <ul className="list-group list-group-flush small">
          <li className="list-group-item d-flex justify-content-between">
            <span>Base</span>
            <strong>₹{breakdown.base ?? 0}</strong>
          </li>
          <li className="list-group-item d-flex justify-content-between">
            <span>Weather Risk</span>
            <strong>+₹{breakdown.weatherRisk ?? 0}</strong>
          </li>
          <li className="list-group-item d-flex justify-content-between">
            <span>Location Risk</span>
            <strong>+₹{breakdown.locationRisk ?? 0}</strong>
          </li>
          <li className="list-group-item d-flex justify-content-between">
            <span>Safe Days Discount</span>
            <strong>{breakdown.safeDiscount ?? 0}</strong>
          </li>
          <li className="list-group-item d-flex justify-content-between">
            <span>Claim Penalty</span>
            <strong>+₹{breakdown.claimPenalty ?? 0}</strong>
          </li>
          <li className="list-group-item d-flex justify-content-between">
            <span>Final Premium</span>
            <strong>₹{premium ?? 0}</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}

