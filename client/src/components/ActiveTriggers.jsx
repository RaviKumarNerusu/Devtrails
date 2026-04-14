import React from "react";

const LABELS = {
  weather: "Weather 🌧️",
  time: "Time ⏱️",
  location: "Location 📍",
  event: "Event ⚡",
  claim: "Claim 🤖",
  rain: "Rain 🌧️",
  heat: "Heat 🔥",
  pollution: "Pollution 🌫️",
  flood: "Flood 🌊",
  social: "Social 🚨"
};

export default function ActiveTriggers({ triggers = [] }) {
  const active = triggers.filter((t) => t.hit);
  if (active.length === 0) {
    return <div className="text-muted small">No active triggers right now.</div>;
  }

  return (
    <div className="d-flex flex-wrap gap-2">
      {active.map((t, idx) => (
        <span key={`${t.type}-${idx}`} className="badge text-bg-warning">
          {LABELS[t.type] || t.type}
        </span>
      ))}
    </div>
  );
}

