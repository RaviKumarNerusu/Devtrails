import React from "react";

function Step({ label, date, active }) {
  return (
    <div className="d-flex align-items-start gap-2">
      <span className={`badge rounded-pill ${active ? "bg-primary" : "bg-secondary"}`}>{active ? "✓" : "•"}</span>
      <div>
        <div className="fw-semibold small">{label}</div>
        <div className="text-muted small">{date ? new Date(date).toLocaleString() : "-"}</div>
      </div>
    </div>
  );
}

export default function ClaimTimeline({ claim }) {
  if (!claim) return null;
  return (
    <div className="d-flex flex-column gap-2">
      <Step label="Eligible" date={claim.createdAt || claim.date} active={Boolean(claim)} />
      <Step label="Claimed" date={claim.claimedAt} active={Boolean(claim.claimedAt)} />
      <Step label="Approved" date={claim.approvedAt} active={Boolean(claim.approvedAt)} />
    </div>
  );
}

