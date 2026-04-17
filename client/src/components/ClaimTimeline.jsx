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
      <Step
        label="Requested"
        date={claim.requestedAt || claim.claimedAt}
        active={Boolean(
          claim.requestedAt ||
          claim.claimedAt ||
          ["pending_approval", "pending"].includes(String(claim.status || "").toLowerCase())
        )}
      />
      <Step label="Approved" date={claim.approvedAt} active={Boolean(claim.approvedAt)} />
      <Step label="Paid" date={claim.paidAt} active={Boolean(claim.paidAt || String(claim.status || "").toLowerCase() === "paid")} />
    </div>
  );
}

