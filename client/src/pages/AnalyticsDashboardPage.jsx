import React, { useEffect, useState } from "react";
import { api } from "../services/apiClient.js";
import CompensationChart from "../components/CompensationChart.jsx";

export default function AnalyticsDashboardPage() {
  const [payouts, setPayouts] = useState([]);
  const [partnerCity, setPartnerCity] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Primary source-of-truth: partner city from saved profile.
        const stored = JSON.parse(localStorage.getItem("partnerProfile") || "null");
        const cityFromStorage = stored?.city || "";

        const { data: profileRes } = await api.get("/partner/profile");
        const city = profileRes?.profile?.city || cityFromStorage;
        setPartnerCity(city);

        const { data } = await api.get(`/compensation/payouts?days=90&city=${encodeURIComponent(city)}`);
        setPayouts(data.items || []);
      } catch {
        setPayouts([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalPayout = payouts.reduce((sum, p) => sum + (p.payoutAmount || 0), 0);
  const totalRainDays = payouts.filter((p) => (p.rainMm || 0) > 0).length;
  const maxRain = payouts.reduce((max, p) => Math.max(max, p.rainMm || 0), 0);

  return (
    <div>
      <h2 className="mb-2">Analytics dashboard</h2>
      <p className="text-muted mb-4">
        Get a quick view of how much rain has impacted your work and how payouts have protected your income over time.
      </p>
      {partnerCity && <div className="text-muted small mb-3">City: <strong>{partnerCity}</strong></div>}
      {loading ? (
        <div>Loading analytics...</div>
      ) : payouts.length === 0 ? (
        <div className="alert alert-secondary" role="alert">
          Not enough data yet. Start using the dashboard and come back after a few rainy days.
        </div>
      ) : (
        <>
          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <div className="card card-glass shadow-sm h-100">
                <div className="card-body">
                  <h6 className="text-muted text-uppercase small mb-1">Total payouts (last 90 days)</h6>
                  <h3>₹{totalPayout.toFixed(0)}</h3>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card card-glass shadow-sm h-100">
                <div className="card-body">
                  <h6 className="text-muted text-uppercase small mb-1">Rain-affected days</h6>
                  <h3>{totalRainDays}</h3>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card card-glass shadow-sm h-100">
                <div className="card-body">
                  <h6 className="text-muted text-uppercase small mb-1">Maximum daily rainfall</h6>
                  <h3>{maxRain.toFixed(1)} mm</h3>
                </div>
              </div>
            </div>
          </div>
          <CompensationChart
            points={payouts.map((p) => ({
              date: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
              rainMm: p.rainMm,
              payoutAmount: p.payoutAmount
            }))}
          />
        </>
      )}
    </div>
  );
}

