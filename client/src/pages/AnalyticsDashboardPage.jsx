import React, { useEffect, useState } from "react";
import { api } from "../services/apiClient.js";
import CompensationChart from "../components/CompensationChart.jsx";
import { useAuth } from "../authContext.jsx";
import { getInsurerAnalytics } from "../services/dashboardService.js";

export default function AnalyticsDashboardPage() {
  const { user } = useAuth();
  const [payouts, setPayouts] = useState([]);
  const [partnerCity, setPartnerCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [insurerAnalytics, setInsurerAnalytics] = useState(null);

  const isInsurerView = ["insurer", "admin"].includes(String(user?.role || "").toLowerCase());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (isInsurerView) {
          const analytics = await getInsurerAnalytics();
          setInsurerAnalytics(analytics);
          setPayouts([]);
          return;
        }

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
        setInsurerAnalytics(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isInsurerView]);

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
      ) : isInsurerView ? (
        <>
          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <div className="card card-glass shadow-sm h-100">
                <div className="card-body">
                  <h6 className="text-muted text-uppercase small mb-1">Total claims</h6>
                  <h3>{insurerAnalytics?.totalClaims ?? 0}</h3>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card card-glass shadow-sm h-100">
                <div className="card-body">
                  <h6 className="text-muted text-uppercase small mb-1">Loss ratio</h6>
                  <h3>{((insurerAnalytics?.lossRatio || 0) * 100).toFixed(1)}%</h3>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card card-glass shadow-sm h-100">
                <div className="card-body">
                  <h6 className="text-muted text-uppercase small mb-1">Total payouts</h6>
                  <h3>₹{Number(insurerAnalytics?.totalPayout || 0).toFixed(0)}</h3>
                </div>
              </div>
            </div>
          </div>
          <div className="card card-glass shadow-sm">
            <div className="card-body">
              <h6 className="text-muted text-uppercase small mb-3">Predicted disruption claims (next week)</h6>
              {(insurerAnalytics?.predictedNextWeekClaims || []).length === 0 ? (
                <div className="text-muted small">No prediction data available yet.</div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {insurerAnalytics.predictedNextWeekClaims.map((item) => (
                    <div key={item.city} className="small">
                      {item.city}: <strong>{item.predictedClaims}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
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

