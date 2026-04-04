import React from "react";

export default function RiskIndicator({ level = "low" }) {
  const normalized = String(level || "low").toLowerCase();
  const map = {
    low: "success",
    medium: "warning",
    high: "danger"
  };
  const color = map[normalized] || "secondary";
  return <span className={`badge bg-${color} text-capitalize`}>{normalized}</span>;
}

