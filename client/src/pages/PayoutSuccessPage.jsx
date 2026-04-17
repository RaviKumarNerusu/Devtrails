import React from "react";
import { Link } from "react-router-dom";

export default function PayoutSuccessPage() {
  return (
    <div className="row justify-content-center">
      <div className="col-md-6">
        <div className="card card-glass shadow-sm text-center">
          <div className="card-body">
            <div className="mb-3">
              <span className="badge bg-success rounded-pill px-3 py-2">Coverage activated</span>
            </div>
            <h2 className="mb-2">Protection is now enabled for you</h2>
            <p className="text-muted mb-4">
              Your selected protection plan has been activated. Your dashboard will automatically reflect payouts and disruption status.
            </p>
            <div className="d-flex flex-wrap justify-content-center gap-2">
              <Link to="/claim-history" className="btn btn-primary">
                View claim history
              </Link>
              <Link to="/dashboard" className="btn btn-outline-secondary">
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

