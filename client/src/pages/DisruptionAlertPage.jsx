import React, { useEffect, useState } from "react";
import { api } from "../services/apiClient.js";

export default function DisruptionAlertPage() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [thresholdNote, setThresholdNote] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data: profileRes } = await api.get("/partner/profile");
        const city = profileRes?.profile?.city || "";

        const { data } = await api.get(`/compensation/payouts?days=14&city=${encodeURIComponent(city)}`);
        setPayouts(data.items || []);

        const t = profileRes?.profile?.rainThresholdMm;
        setThresholdNote(t ? `Threshold: ${t} mm` : "");
      } catch {
        setPayouts([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading disruption alerts...</div>;

  return (
    <div>
      <h2 className="mb-2">Disruption alerts</h2>
      <p className="text-muted mb-4">
        Recent days where rainfall impacted your work and triggered, or nearly triggered, insurance disruption logic.
      </p>
      {thresholdNote ? <div className="text-muted small mb-3">{thresholdNote}</div> : null}
      {payouts.length === 0 ? (
        <div className="alert alert-success" role="alert">
          No disruption alerts found for your partner city.
        </div>
      ) : (
        <div className="list-group">
          {payouts.slice(0, 14).map((p) => (
            <div key={p._id} className="list-group-item d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-semibold">
                  {new Date(p.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </div>
                <div className="small text-muted">
                  Rain: {p.rainMm?.toFixed(1) ?? "--"} mm · Risk: {p.riskLevel || "UNKNOWN"}
                </div>
              </div>
              <div className="text-end">
                <div className={p.payoutAmount > 0 ? "text-success fw-semibold" : "text-muted fw-semibold"}>
                  Payout: ₹{p.payoutAmount?.toFixed(0) ?? "0"}
                </div>
                <div className="small text-muted">Status: {p.status || "not triggered"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

