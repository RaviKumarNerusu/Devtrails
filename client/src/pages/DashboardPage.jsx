import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/apiClient.js";
import { getWeather } from "../services/weatherService.js";
import { getTriggerStatus } from "../services/policyService.js";
import { getDashboardSummary } from "../services/dashboardService.js";
import WeatherCards from "../components/WeatherCards.jsx";
import TemperatureChart from "../components/TemperatureChart.jsx";
import CompensationChart from "../components/CompensationChart.jsx";
import RiskIndicator from "../components/RiskIndicator.jsx";
import ActiveTriggers from "../components/ActiveTriggers.jsx";
import { useAuth } from "../authContext.jsx";

function riskSubtitle(risk) {
  if (risk === "LOW") return "No disruption expected";
  if (risk === "MEDIUM") return "Minor income impact";
  if (risk === "HIGH") return "Moderate disruption";
  if (risk === "SEVERE") return "Severe disruption - payout triggered";
  return "Protection status unknown";
}

function claimStatusLabel(claim) {
  const status = String(claim?.status || "").toLowerCase();
  const amount = Number(claim?.payoutAmount ?? claim?.amount ?? 0);

  if (status === "eligible") return amount > 0 ? `Eligible for Rs ${amount.toFixed(0)}` : "Eligible today";
  if (status === "claimed") return "Claimed";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Not Eligible Today";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [city, setCity] = useState("");
  const [activeCity, setActiveCity] = useState("");
  const [weather, setWeather] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState({
    city: "",
    pincode: "",
    avgDailyEarning: "",
    rainThresholdMm: 15
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [todayComp, setTodayComp] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [policyInfo, setPolicyInfo] = useState(null);
  const [claimSummary, setClaimSummary] = useState({ total: 0, paid: 0 });
  const [triggerStatus, setTriggerStatus] = useState([]);
  const [recentClaims, setRecentClaims] = useState([]);
  const [todayClaim, setTodayClaim] = useState(null);
  const [claimError, setClaimError] = useState("");
  const [profileSaveMessage, setProfileSaveMessage] = useState("");
  const [profileSaveError, setProfileSaveError] = useState("");

  const loadHistory = async () => {
    try {
      const { data } = await api.get("/history");
      setHistory(data.items || []);
    } catch {
      // ignore for now
    }
  };

  const loadFavorites = async () => {
    try {
      const { data } = await api.get("/favorite");
      setFavorites(data.items || []);
    } catch {
      // ignore for now
    }
  };

  const loadProfile = async () => {
    try {
      const { data } = await api.get("/partner/profile");
      if (data && data.profile) {
        const nextProfile = {
          city: data.profile.city || "",
          pincode: data.profile.pincode || "",
          avgDailyEarning: data.profile.avgDailyEarning?.toString() || "",
          rainThresholdMm: data.profile.rainThresholdMm || 15
        };
        setProfile(nextProfile);
        setActiveCity(nextProfile.city);
        setCity(nextProfile.city);
        localStorage.setItem(
          "partnerProfile",
          JSON.stringify({
            city: nextProfile.city,
            pincode: nextProfile.pincode,
            avgEarning: Number(nextProfile.avgDailyEarning) || 0,
            threshold: Number(nextProfile.rainThresholdMm) || 15
          })
        );
        return nextProfile.city;
      }
    } catch {
      // ignore for now, fallback to localStorage
    }

    try {
      const stored = JSON.parse(localStorage.getItem("partnerProfile") || "null");
      if (stored?.city) {
        const nextProfile = {
          city: stored.city,
          pincode: stored.pincode || "",
          avgDailyEarning: String(stored.avgEarning ?? 0),
          rainThresholdMm: stored.threshold ?? 15
        };
        setProfile(nextProfile);
        setActiveCity(nextProfile.city);
        setCity(nextProfile.city);
        return nextProfile.city;
      }
    } catch {
      // ignore
    }

    return "";
  };

  const loadDashboardSummary = async () => {
    try {
      const summary = (await getDashboardSummary()) || {};

      setTodayComp(summary.todayComp || {
        hasPolicy: summary.hasPolicy,
        rainMm: summary.rainMm,
        threshold: summary.threshold,
        predictedLoss: summary.predictedLoss,
        showTakePolicy: summary.showTakePolicy
      });

      if (summary.hasPolicy) {
        setPolicyInfo({
          dynamicPremium: summary?.policy?.dynamicPremium ?? 100,
          riskLevel: summary?.policy?.riskLevel ?? "low",
          isActive: true
        });
        setTodayClaim(summary.claim || null);
        setClaimSummary(summary.claimSummary || { total: 0, paid: 0 });
        setRecentClaims(Array.isArray(summary.recentClaims) ? summary.recentClaims : []);
      } else {
        setPolicyInfo({ dynamicPremium: 0, riskLevel: "low", isActive: false });
        setTodayClaim(null);
        setClaimSummary({ total: 0, paid: 0 });
        setRecentClaims([]);
      }
    } catch {
      setTodayComp(null);
    }
  };

  const loadPayoutHistory = async (partnerCity) => {
    try {
      const cityToUse = partnerCity || profile?.city || "";
      const { data } = await api.get(`/compensation/payouts?days=30&city=${encodeURIComponent(cityToUse)}`);
      setPayoutHistory(data.items || []);
    } catch {
      setPayoutHistory([]);
    }
  };

  const loadPolicyAndClaims = async () => {
    if (!user?.id) return;
    try {
      setClaimError("");
      await loadDashboardSummary();

      const triggerPayload = await getTriggerStatus();
      setTriggerStatus(triggerPayload?.triggers || []);
    } catch {
      // ignore dashboard summary failures
    }
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadHistory(), loadFavorites()]);
      const partnerCity = await loadProfile();
      await loadPayoutHistory(partnerCity);
      await loadPolicyAndClaims();
      if (partnerCity) {
        await performSearch(partnerCity, { skipMetaRefresh: true });
      }
    })();
  }, []);

  useEffect(() => {
    // Live premium/risk update polling
    const interval = setInterval(async () => {
      await loadPolicyAndClaims();
    }, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const performSearch = async (targetCity, opts = {}) => {
    const queryCity = String(targetCity || city || "").trim();
    if (!queryCity) return;
    setLoading(true);
    setError("");
    try {
      const data = await getWeather(queryCity);
      setWeather(data);
      setAlerts(data?.alerts || []);
      setCity(queryCity);
      setActiveCity(queryCity);
      if (!opts.skipMetaRefresh) {
        await Promise.all([loadHistory(), loadFavorites()]);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch weather");
      setWeather(null);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    performSearch();
  };

  const handleAddFavorite = async () => {
    if (!weather?.city) return;
    try {
      await api.post("/favorite", { city: weather.city });
      await loadFavorites();
    } catch {
      // ignore duplicate errors
    }
  };

  return (
    <div className="row">
      <div className="col-lg-8">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h2 className="mb-0">Rain Compensation Dashboard</h2>
          <div className="d-flex flex-wrap gap-2">
            <Link to="/plans" className="btn btn-sm btn-outline-primary">
              View plans
            </Link>
            <Link to="/disruption-alerts" className="btn btn-sm btn-outline-warning">
              Disruption alerts
            </Link>
            <Link to="/analytics" className="btn btn-sm btn-outline-secondary">
              Analytics
            </Link>
          </div>
        </div>
        {policyInfo ? (
          <div className="card card-glass shadow-sm mb-3">
            <div className="card-body d-flex flex-wrap justify-content-between">
              <div className="me-3">
                <div className="small text-muted">Current premium</div>
                <div className="h5 mb-0">₹{Number(policyInfo.dynamicPremium || 0).toFixed(0)}</div>
              </div>
              <div className="me-3">
                <div className="small text-muted">Risk level</div>
                <div className="h5 text-capitalize mb-0">
                  <RiskIndicator level={policyInfo.riskLevel} />
                </div>
              </div>
              <div className="me-3">
                <div className="small text-muted">Active policy</div>
                <div className="h5 mb-0">{policyInfo.isActive ? "Yes" : "No"}</div>
              </div>
              <div>
                <div className="small text-muted">Claim history</div>
                <div className="h5 mb-0">
                  {claimSummary.paid}/{claimSummary.total} paid
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="card card-glass shadow-sm mb-3">
          <div className="card-body">
            <div className="small text-muted mb-2">Active automation triggers</div>
            <ActiveTriggers triggers={triggerStatus} />
          </div>
        </div>
        {todayComp && todayComp.hasPolicy !== false && (
          <div className="card card-glass shadow-sm mb-3">
            <div className="card-body d-flex flex-wrap justify-content-between align-items-center">
              <div>
                <h5 className="card-title mb-1">
                  Today in {todayComp.city} – {todayComp.rainMm?.toFixed(1) ?? "-"} mm
                </h5>
                <p className="mb-0 text-muted small">
                  Risk: <strong>{todayComp.riskLevel || "UNKNOWN"}</strong> · Threshold:{" "}
                  {todayComp.rainThresholdMm} mm
                </p>
                {todayComp?.hasPolicy && todayClaim ? <div className="mt-2 small fw-semibold">{claimStatusLabel(todayClaim)}</div> : null}
              </div>
              <div className="text-end">
                {(() => {
                  const planActive = Boolean(policyInfo?.isActive);
                  if (!planActive) {
                    return (
                      <>
                        <div className="fw-semibold text-warning">Take Policy to Recover Payout</div>
                        <div className="text-muted small">Potential loss: ₹{Number(todayComp.predictedLoss || 0).toFixed(0)}</div>
                      </>
                    );
                  }

                  const risk = todayComp.riskLevel || "UNKNOWN";
                  const payout = Number(todayComp.payoutAmount || 0);

                  if (payout <= 0) {
                    return (
                      <>
                        <div className="fw-semibold">No income disruption expected</div>
                        <div className="text-muted small">{riskSubtitle(risk)}</div>
                      </>
                    );
                  }

                  return (
                    <>
                      <div className={risk === "HIGH" || risk === "SEVERE" ? "fw-semibold text-warning" : "fw-semibold"}>
                        {risk === "MEDIUM" ? "Minor income impact" : "⚠️ Disruption detected"}
                      </div>
                      <div className="text-muted small">Payout credited: ₹{payout.toFixed(0)}</div>
                      <div className="text-success small">✅ Payout credited</div>
                    </>
                  );

                })()}
              </div>
            </div>
          </div>
        )}

        {todayComp && todayComp.hasPolicy === false ? (
          <div className="alert alert-warning border border-danger-subtle d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-semibold text-danger">Disruption detected</div>
              <div className="small">Rain: {Number(todayComp.rainMm || 0).toFixed(1)} mm</div>
              <div className="small">Threshold: {Number(todayComp.threshold || 0).toFixed(1)} mm</div>
              <div className="small">Potential loss ₹{Number(todayComp.predictedLoss || 0).toFixed(0)}</div>
            </div>
            <Link to="/plans" className="btn btn-danger btn-sm">
              Take Policy to Recover Payout
            </Link>
          </div>
        ) : null}

        {policyInfo && !policyInfo.isActive ? (
          <div className="alert alert-warning d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-semibold">No Active Policy</div>
              <div className="small">Select a plan to receive payouts</div>
            </div>
            <Link to="/plans" className="btn btn-sm btn-warning">
              Select a Plan
            </Link>
          </div>
        ) : null}

        {claimError ? <div className="alert alert-info">{claimError}</div> : null}

        {policyInfo?.isActive && String(todayClaim?.status || "").toLowerCase() === "eligible" ? (
          <div className="alert alert-success d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-semibold">Claim Available!</div>
              <div className="small">Rain exceeded threshold. You can claim this daily record now.</div>
            </div>
            <Link to="/claims" className="btn btn-sm btn-success">
              Claim Now
            </Link>
          </div>
        ) : null}

        {todayComp?.hasPolicy && (todayComp?.riskLevel === "HIGH" || todayComp?.riskLevel === "SEVERE") ? (
          <div className="card card-glass shadow-sm mb-3">
            <div className="card-body">
              <h5 className="card-title mb-2">💰 Income Protection Summary</h5>
              <div className="row g-2 small">
                <div className="col-md-6">
                  <div className="text-muted">Rainfall</div>
                  <div className="fw-semibold">{Number(todayComp.rainMm || 0).toFixed(1)} mm</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted">Threshold</div>
                  <div className="fw-semibold">{Number(todayComp.rainThresholdMm || 0).toFixed(1)} mm</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted">Disruption Ratio</div>
                  <div className="fw-semibold">
                    {(() => {
                      const r = Number(todayComp.rainMm || 0);
                      const t = Number(todayComp.rainThresholdMm || 0);
                      if (!t) return "--";
                      return (r / t).toFixed(2);
                    })()}
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted">Disruption level</div>
                  <div className="fw-semibold">{todayComp.riskLevel || "UNKNOWN"}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted">Avg Daily Earning</div>
                  <div className="fw-semibold">₹{Number(todayComp.avgDailyEarning || 0).toFixed(0)}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted">Predicted Loss</div>
                  <div className="fw-semibold">₹{Number(todayComp.predictedLoss || 0).toFixed(0)}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted">Final Payout</div>
                  <div className="fw-semibold text-success">₹{Number(todayComp.payoutAmount || 0).toFixed(0)}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <form className="row g-2 mb-3" onSubmit={handleSubmit}>
          <div className="col-sm-8">
            <input
              type="text"
              className="form-control"
              placeholder="Search city..."
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="col-sm-4 d-flex gap-2">
            <button type="submit" className="btn btn-primary flex-grow-1" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
            {weather?.city && (
              <button type="button" className="btn btn-outline-secondary" onClick={handleAddFavorite}>
                Add to Favorites
              </button>
            )}
          </div>
        </form>
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        {weather && (
          <>
            <h4 className="mb-2">
              {weather.city}
              {activeCity && weather.city !== activeCity ? (
                <span className="ms-2 badge text-bg-secondary">Search view</span>
              ) : null}
            </h4>
            <WeatherCards current={weather.current} />
            <TemperatureChart trend={weather.forecast?.trend || []} />
          </>
        )}
        {alerts.length > 0 && (
          <div className="alert alert-warning">
            <strong>Weather Alerts:</strong>
            <ul className="mb-0">
              {alerts.map((a, idx) => (
                <li key={idx}>{a.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="col-lg-4">
        <div className="mb-3">
          <h5>Partner Settings</h5>
          <div className="card card-glass shadow-sm mb-3">
            <div className="card-body">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setProfileSaving(true);
                  setProfileSaveMessage("");
                  setProfileSaveError("");
                  try {
                    await api.post("/partner/profile", {
                      city: profile.city,
                      pincode: profile.pincode,
                      avgDailyEarning: Number(profile.avgDailyEarning) || 0,
                      rainThresholdMm: Number(profile.rainThresholdMm) || 15
                    });
                    localStorage.setItem(
                      "partnerProfile",
                      JSON.stringify({
                        city: profile.city,
                        pincode: profile.pincode,
                        avgEarning: Number(profile.avgDailyEarning) || 0,
                        threshold: Number(profile.rainThresholdMm) || 15
                      })
                    );
                    setActiveCity(profile.city || "");
                    await loadProfile();
                    await loadDashboardSummary();
                    await loadPayoutHistory(profile.city || "");
                    if (profile.city) {
                      await performSearch(profile.city, { fromAuto: true });
                    }
                    setProfileSaveMessage("Profile saved successfully.");
                  } catch (err) {
                    setProfileSaveError(err?.response?.data?.message || err.message || "Failed to save profile");
                  } finally {
                    setProfileSaving(false);
                  }
                }}
              >
                <div className="mb-2">
                  <label className="form-label small">City</label>
                  <input
                    className="form-control form-control-sm"
                    value={profile.city}
                    onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Pincode</label>
                  <input
                    className="form-control form-control-sm"
                    value={profile.pincode}
                    onChange={(e) => setProfile((p) => ({ ...p, pincode: e.target.value }))}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Avg daily earning (₹)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={profile.avgDailyEarning}
                    onChange={(e) => setProfile((p) => ({ ...p, avgDailyEarning: e.target.value }))}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small">Rain threshold (mm)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={profile.rainThresholdMm}
                    onChange={(e) => setProfile((p) => ({ ...p, rainThresholdMm: e.target.value }))}
                  />
                </div>
                <button className="btn btn-sm btn-primary w-100" type="submit" disabled={profileSaving}>
                  {profileSaving ? "Saving..." : "Save profile"}
                </button>
                {profileSaveMessage ? <div className="text-success small mt-2">{profileSaveMessage}</div> : null}
                {profileSaveError ? <div className="text-danger small mt-2">{profileSaveError}</div> : null}
              </form>
            </div>
          </div>
        </div>
        <div className="mb-3">
          <h5>Recent Searches</h5>
          <div className="list-group small">
            {history.length === 0 && <div className="text-muted">No searches yet.</div>}
            {history.map((item) => (
              <button
                key={item._id}
                type="button"
                className="list-group-item list-group-item-action"
                onClick={() => performSearch(item.city)}
              >
                {item.city}{" "}
                <span className="text-muted">
                  {new Date(item.date).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <h5>Favorites</h5>
          <div className="list-group small">
            {favorites.length === 0 && <div className="text-muted">No favorites yet.</div>}
            {favorites.map((fav) => (
              <button
                key={fav._id}
                type="button"
                className="list-group-item list-group-item-action"
                onClick={() => performSearch(fav.city)}
              >
                {fav.city}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <h5>Recent Claims</h5>
          <div className="card card-glass shadow-sm">
            <div className="card-body">
              {!policyInfo?.isActive ? (
                <div className="text-muted small">Take a policy to enable claim records.</div>
              ) : null}
              {policyInfo?.isActive && recentClaims.length === 0 ? (
                <div className="text-muted small">No claim records yet. Open dashboard after profile and plan setup.</div>
              ) : (
                policyInfo?.isActive ? <div className="list-group small">
                  {recentClaims.map((c) => (
                    <div key={c._id} className="list-group-item">
                      <div className="d-flex justify-content-between">
                        <span>{c.city || "-"}</span>
                        <span className="text-capitalize">{c.status}</span>
                      </div>
                      <div className="text-muted">
                        ₹{Number((c.amount ?? c.payoutAmount) || 0).toFixed(0)} · {new Date(c.createdAt || c.date).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div> : null
              )}
            </div>
          </div>
        </div>
        <div>
          <h5>Payout History</h5>
          <div className="card card-glass shadow-sm">
            <div className="card-body">
              {!policyInfo?.isActive ? (
                <div className="alert alert-warning mb-0" role="alert">
                  Insurance is required. Take policy to recover payout.
                </div>
              ) : payoutHistory.length === 0 ? (
                <div className="alert alert-secondary mb-0" role="alert">
                  No analytics data yet for your partner city.
                </div>
              ) : (
                <CompensationChart
                  points={payoutHistory.map((p) => ({
                    date: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                    rainMm: p.rainMm,
                    payoutAmount: p.payoutAmount
                  }))}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
