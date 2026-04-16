import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/apiClient.js";
import { getWeather } from "../services/weatherService.js";
import { getTriggerStatus } from "../services/policyService.js";
import { getDashboardSummary, getInsurerAnalytics } from "../services/dashboardService.js";
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

const CITY_DIRECTORY = [
  { city: "Brahmanidam", district: "Prakasam", state: "Andhra Pradesh", pincode: "523183", risk: "MEDIUM" },
  { city: "Nidamanuru", district: "Krishna", state: "Andhra Pradesh", pincode: "521104", risk: "MEDIUM" },
  { city: "Guntur", district: "Guntur", state: "Andhra Pradesh", pincode: "522002", risk: "MEDIUM" },
  { city: "Vijayawada", district: "NTR", state: "Andhra Pradesh", pincode: "520001", risk: "HIGH" },
  { city: "Visakhapatnam", district: "Visakhapatnam", state: "Andhra Pradesh", pincode: "530001", risk: "HIGH" },
  { city: "Tirupati", district: "Tirupati", state: "Andhra Pradesh", pincode: "517501", risk: "MEDIUM" },
  { city: "Kurnool", district: "Kurnool", state: "Andhra Pradesh", pincode: "518001", risk: "MEDIUM" },
  { city: "Rajahmundry", district: "East Godavari", state: "Andhra Pradesh", pincode: "533101", risk: "MEDIUM" },
  { city: "Nellore", district: "SPSR Nellore", state: "Andhra Pradesh", pincode: "524001", risk: "MEDIUM" },
  { city: "Anantapur", district: "Anantapur", state: "Andhra Pradesh", pincode: "515001", risk: "LOW" },
  { city: "Hyderabad", district: "Hyderabad", state: "Telangana", pincode: "500001", risk: "HIGH" },
  { city: "Warangal", district: "Hanamkonda", state: "Telangana", pincode: "506002", risk: "MEDIUM" },
  { city: "Bengaluru", district: "Bengaluru Urban", state: "Karnataka", pincode: "560001", risk: "HIGH" },
  { city: "Chennai", district: "Chennai", state: "Tamil Nadu", pincode: "600001", risk: "HIGH" },
  { city: "Mumbai", district: "Mumbai", state: "Maharashtra", pincode: "400001", risk: "HIGH" },
  { city: "Pune", district: "Pune", state: "Maharashtra", pincode: "411001", risk: "MEDIUM" },
  { city: "Delhi", district: "New Delhi", state: "Delhi", pincode: "110001", risk: "MEDIUM" },
  { city: "Kolkata", district: "Kolkata", state: "West Bengal", pincode: "700001", risk: "HIGH" }
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function findExactCityMatch(cityName) {
  const needle = normalizeText(cityName);
  if (!needle) return null;
  return CITY_DIRECTORY.find((entry) => normalizeText(entry.city) === needle) || null;
}

function getCitySuggestions(query, limit = 6) {
  const needle = normalizeText(query);
  if (!needle) return [];

  const startsWithCity = [];
  const includesCity = [];

  for (const entry of CITY_DIRECTORY) {
    const city = normalizeText(entry.city);
    const district = normalizeText(entry.district);
    const state = normalizeText(entry.state);
    const pincode = normalizeText(entry.pincode);
    const isMatch = city.includes(needle) || district.includes(needle) || state.includes(needle) || pincode.includes(needle);
    if (!isMatch) continue;
    if (city.startsWith(needle)) {
      startsWithCity.push(entry);
    } else {
      includesCity.push(entry);
    }
  }

  return [...startsWithCity, ...includesCity].slice(0, limit);
}

function riskBadgeClass(risk) {
  const normalized = String(risk || "").toUpperCase();
  if (normalized === "HIGH" || normalized === "SEVERE") return "text-bg-danger";
  if (normalized === "MEDIUM") return "text-bg-warning";
  return "text-bg-success";
}

function formatRisk(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "--";
  return numberValue.toFixed(2);
}

function formatRoleLabel(role) {
  const value = String(role || "partner").trim().toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const RAIN_CHECK_CITIES = ["Feni", "Dhaka", "Chattogram", "Sylhet", "Khulna", "Barishal"];

function buildFallbackInsurerPreview(summary, policyInfo, recentClaims, claimSummary) {
  const weeklyPremium = Number(summary?.policy?.weekly_premium ?? policyInfo?.weeklyPremium ?? 0);
  const sampledPayout = (recentClaims || []).reduce(
    (sum, claim) => sum + Number(claim?.payoutAmount ?? claim?.payout_amount ?? claim?.amount ?? 0),
    0
  );
  const estimatedPayout = sampledPayout + Number(summary?.todayComp?.payoutAmount || 0);
  const lossRatio = weeklyPremium > 0 ? estimatedPayout / weeklyPremium : 0;

  return {
    source: "preview",
    lossRatio,
    next_week_risk: Number(summary?.next_week_risk ?? policyInfo?.nextWeekRisk ?? 0),
    avg_risk: Number(summary?.avg_risk ?? policyInfo?.avgRisk ?? 0),
    totalClaims: Number(claimSummary?.total || 0),
    approvedClaims: Number(claimSummary?.paid || 0)
  };
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
    district: "",
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
  const [isProfileCityMenuOpen, setIsProfileCityMenuOpen] = useState(false);
  const [activeCitySuggestionIndex, setActiveCitySuggestionIndex] = useState(-1);
  const [cityAutoHint, setCityAutoHint] = useState("");
  const [rainCitySignals, setRainCitySignals] = useState([]);
  const [rainCityLoading, setRainCityLoading] = useState(false);
  const [rainCityError, setRainCityError] = useState("");
  const [dashboardSnapshot, setDashboardSnapshot] = useState(null);
  const [insurerPreview, setInsurerPreview] = useState(null);
  const cityMenuCloseTimerRef = useRef(null);
  const citySuggestionItemRefs = useRef([]);
  const hasRiskScore = policyInfo?.riskScore !== null && policyInfo?.riskScore !== undefined;
  const hasWeeklyPremium = policyInfo?.weeklyPremium !== null && policyInfo?.weeklyPremium !== undefined;
  const citySuggestions = useMemo(() => getCitySuggestions(profile.city), [profile.city]);

  useEffect(() => {
    if (!isProfileCityMenuOpen || citySuggestions.length === 0) {
      setActiveCitySuggestionIndex(-1);
      return;
    }
    if (activeCitySuggestionIndex >= citySuggestions.length) {
      setActiveCitySuggestionIndex(0);
    }
  }, [citySuggestions, isProfileCityMenuOpen, activeCitySuggestionIndex]);

  useEffect(() => {
    if (!isProfileCityMenuOpen) return;
    if (activeCitySuggestionIndex < 0) return;
    const activeItem = citySuggestionItemRefs.current[activeCitySuggestionIndex];
    if (activeItem && typeof activeItem.scrollIntoView === "function") {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [activeCitySuggestionIndex, isProfileCityMenuOpen]);

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
          district: data.profile.district || data.profile.city || "",
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
            district: nextProfile.district,
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
          district: stored.district || stored.city || "",
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
      setDashboardSnapshot(summary);

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
          weeklyPremium: summary?.policy?.weekly_premium ?? summary?.policy?.weeklyPremium ?? 0,
          riskScore: summary?.user?.risk_score ?? summary?.claim?.risk_score ?? 0,
          riskLevel: summary?.policy?.riskLevel ?? "low",
          nextWeekRisk: summary?.next_week_risk ?? 0,
          avgRisk: summary?.avg_risk ?? 0,
          totalClaimsLastWeek: summary?.total_claims_last_week ?? 0,
          isActive: true
        });
        setTodayClaim(summary.claim || null);
        setClaimSummary(summary.claimSummary || { total: 0, paid: 0 });
        setRecentClaims(Array.isArray(summary.recentClaims) ? summary.recentClaims : []);
      } else {
        setPolicyInfo({
          dynamicPremium: 0,
          weeklyPremium: null,
          riskScore: null,
          riskLevel: "low",
          nextWeekRisk: summary?.next_week_risk ?? 0,
          avgRisk: summary?.avg_risk ?? 0,
          totalClaimsLastWeek: summary?.total_claims_last_week ?? 0,
          isActive: false
        });
        setTodayClaim(null);
        setClaimSummary({ total: 0, paid: 0 });
        setRecentClaims([]);
      }

      try {
        const role = String(user?.role || "").toLowerCase();
        if (role === "insurer" || role === "admin") {
          const analytics = await getInsurerAnalytics();
          if (analytics) {
            setInsurerPreview({ ...analytics, source: "admin" });
          }
        } else {
          setInsurerPreview(buildFallbackInsurerPreview(summary, {
            weeklyPremium: summary?.policy?.weekly_premium ?? summary?.policy?.weeklyPremium ?? 0,
            nextWeekRisk: summary?.next_week_risk ?? 0,
            avgRisk: summary?.avg_risk ?? 0
          }, Array.isArray(summary?.recentClaims) ? summary.recentClaims : [], summary?.claimSummary || { total: 0, paid: 0 }));
        }
      } catch {
        setInsurerPreview(buildFallbackInsurerPreview(summary, {
          weeklyPremium: summary?.policy?.weekly_premium ?? summary?.policy?.weeklyPremium ?? 0,
          nextWeekRisk: summary?.next_week_risk ?? 0,
          avgRisk: summary?.avg_risk ?? 0
        }, Array.isArray(summary?.recentClaims) ? summary.recentClaims : [], summary?.claimSummary || { total: 0, paid: 0 }));
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

  const loadRainCitySignals = async (thresholdOverride = null) => {
    const threshold = Number(thresholdOverride ?? profile?.rainThresholdMm ?? 15) || 15;
    setRainCityLoading(true);
    setRainCityError("");

    try {
      const results = await Promise.all(
        RAIN_CHECK_CITIES.map(async (cityName) => {
          try {
            const { data } = await api.post("/policy/premium/calculate", {
              location: cityName,
              threshold
            });

            const weatherSnapshot = data?.weather || {};
            const rainMm = Number(weatherSnapshot?.rainMm || 0);

            return {
              city: cityName,
              rainMm: Number.isFinite(rainMm) ? rainMm : 0,
              condition: String(weatherSnapshot?.condition || "Unknown"),
              threshold,
              eligible: Number.isFinite(rainMm) ? rainMm > threshold : false
            };
          } catch {
            return {
              city: cityName,
              rainMm: 0,
              condition: "Unavailable",
              threshold,
              eligible: false,
              unavailable: true
            };
          }
        })
      );

      const rainyOnly = results
        .filter((item) => !item.unavailable && Number(item.rainMm) > 0)
        .sort((a, b) => b.rainMm - a.rainMm);

      setRainCitySignals(rainyOnly);
    } catch (err) {
      setRainCityError(err?.response?.data?.message || err.message || "Failed to load rain city checker");
    } finally {
      setRainCityLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadHistory(), loadFavorites()]);
      const partnerCity = await loadProfile();
      await loadPayoutHistory(partnerCity);
      await loadPolicyAndClaims();
      await loadRainCitySignals();
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
      const fallbackDistrict = String(profile?.district || "").trim();
      const shouldTryDistrictFallback = fallbackDistrict && fallbackDistrict.toLowerCase() !== queryCity.toLowerCase();

      if (shouldTryDistrictFallback) {
        try {
          const fallbackData = await getWeather(fallbackDistrict);
          setWeather(fallbackData);
          setAlerts(fallbackData?.alerts || []);
          setCity(fallbackDistrict);
          setActiveCity(fallbackDistrict);
          setError(`__info__"${queryCity}" not found. Showing nearby district weather for ${fallbackDistrict}.`);
          if (!opts.skipMetaRefresh) {
            await Promise.all([loadHistory(), loadFavorites()]);
          }
          return;
        } catch {
          // District fallback failed; use original error path.
        }
      }

      setError(err.response?.data?.message || `City "${queryCity}" not found`);
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

  const applyCitySuggestion = (entry) => {
    if (!entry) return;
    setProfile((prev) => ({ ...prev, city: entry.city, district: entry.district || entry.city, pincode: entry.pincode }));
    setCityAutoHint(`Pincode ${entry.pincode} auto-filled for ${entry.city}.`);
    setIsProfileCityMenuOpen(false);
    setActiveCitySuggestionIndex(-1);
  };

  const handleProfileCityChange = (value) => {
    setProfile((prev) => ({ ...prev, city: value }));
    setCityAutoHint("");

    const exactMatch = findExactCityMatch(value);
    if (exactMatch) {
      setProfile((prev) => ({
        ...prev,
        city: exactMatch.city,
        district: exactMatch.district || exactMatch.city,
        pincode: exactMatch.pincode
      }));
      setCityAutoHint(`Pincode ${exactMatch.pincode} auto-filled for ${exactMatch.city}.`);
    }
  };

  const handleProfileCityFocus = () => {
    if (cityMenuCloseTimerRef.current) {
      clearTimeout(cityMenuCloseTimerRef.current);
      cityMenuCloseTimerRef.current = null;
    }
    setIsProfileCityMenuOpen(true);
    if (citySuggestions.length > 0) {
      setActiveCitySuggestionIndex(0);
    }
  };

  const handleProfileCityBlur = () => {
    cityMenuCloseTimerRef.current = setTimeout(() => {
      setIsProfileCityMenuOpen(false);
      setActiveCitySuggestionIndex(-1);
    }, 120);
  };

  const handleProfileCityKeyDown = (event) => {
    if (!isProfileCityMenuOpen || citySuggestions.length === 0) {
      if (event.key === "ArrowDown" && citySuggestions.length > 0) {
        event.preventDefault();
        setIsProfileCityMenuOpen(true);
        setActiveCitySuggestionIndex(0);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveCitySuggestionIndex((prev) => (prev + 1) % citySuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveCitySuggestionIndex((prev) => (prev <= 0 ? citySuggestions.length - 1 : prev - 1));
      return;
    }

    if (event.key === "Enter") {
      if (activeCitySuggestionIndex >= 0) {
        event.preventDefault();
        applyCitySuggestion(citySuggestions[activeCitySuggestionIndex]);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsProfileCityMenuOpen(false);
      setActiveCitySuggestionIndex(-1);
    }
  };

  useEffect(() => {
    return () => {
      if (cityMenuCloseTimerRef.current) {
        clearTimeout(cityMenuCloseTimerRef.current);
      }
    };
  }, []);

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
                <div className="small text-muted">Risk Score</div>
                <div className="h5 mb-0">{hasRiskScore ? Number(policyInfo.riskScore).toFixed(2) : "Calculating..."}</div>
              </div>
              <div className="me-3">
                <div className="small text-muted">Weekly Premium</div>
                <div className="h5 mb-0">{hasWeeklyPremium ? `₹${Number(policyInfo.weeklyPremium).toFixed(0)}` : "Calculating..."}</div>
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
            <div className="border-top pt-3 mt-3">
              <div className="small text-muted mb-1">Prediction snapshot</div>
              <div className="d-flex flex-wrap gap-3 small">
                <div>
                  <div className="text-muted">Next week risk</div>
                  <div className="fw-semibold">{formatRisk(policyInfo.nextWeekRisk)}</div>
                </div>
                <div>
                  <div className="text-muted">Average risk</div>
                  <div className="fw-semibold">{formatRisk(policyInfo.avgRisk)}</div>
                </div>
                <div>
                  <div className="text-muted">Claims last 7 days</div>
                  <div className="fw-semibold">{Number(policyInfo.totalClaimsLastWeek || 0).toFixed(0)}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="card card-glass shadow-sm mb-3">
          <div className="card-body">
            <h5 className="card-title mb-3">Intelligent Dashboard</h5>
            <div className="row g-3 small">
              <div className="col-md-6">
                <div className="border rounded p-3 h-100">
                  <div className="fw-semibold mb-2">For Workers</div>
                  <div className="text-muted">Earnings protected, active weekly coverage.</div>
                  <div className="mt-2 d-flex justify-content-between">
                    <span className="text-muted">Weekly coverage</span>
                    <span className="fw-semibold">
                      {policyInfo?.isActive ? `₹${Number(policyInfo?.weeklyPremium || 0).toFixed(0)}` : "Inactive"}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="text-muted">Claim status</span>
                    <span className="fw-semibold">{claimStatusLabel(todayClaim)}</span>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="border rounded p-3 h-100">
                  <div className="fw-semibold mb-2 d-flex justify-content-between align-items-center">
                    <span>For Insurers (Admin)</span>
                    {insurerPreview?.source !== "admin" ? <span className="badge text-bg-secondary">Preview</span> : null}
                  </div>
                  <div className="text-muted">Loss ratios and predictive analytics on next week weather/disruption claims.</div>
                  <div className="mt-2 d-flex justify-content-between">
                    <span className="text-muted">Loss ratio</span>
                    <span className="fw-semibold">{Number(insurerPreview?.lossRatio || 0).toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="text-muted">Next week risk</span>
                    <span className="fw-semibold">{formatRisk(insurerPreview?.next_week_risk ?? dashboardSnapshot?.next_week_risk ?? 0)}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="text-muted">Claims tracked</span>
                    <span className="fw-semibold">{Number(insurerPreview?.totalClaims || claimSummary?.total || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
          <div className={`alert ${error.startsWith("__info__") ? "alert-success" : "alert-danger"}`} role="alert">
            {error.startsWith("__info__") ? error.replace("__info__", "") : error}
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
          <h5>Profile Structure</h5>
          <div className="card card-glass shadow-sm">
            <div className="card-body small">
              <div className="d-flex justify-content-between mb-1">
                <span className="text-muted">Name</span>
                <span className="fw-semibold">{user?.name || "--"}</span>
              </div>
              <div className="d-flex justify-content-between mb-1">
                <span className="text-muted">Email</span>
                <span className="fw-semibold text-break">{user?.email || "--"}</span>
              </div>
              <div className="d-flex justify-content-between mb-1">
                <span className="text-muted">Role</span>
                <span className="fw-semibold">{formatRoleLabel(user?.role)}</span>
              </div>
              <div className="d-flex justify-content-between mb-1">
                <span className="text-muted">Profile city</span>
                <span className="fw-semibold">{profile?.city || "--"}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-muted">Pincode</span>
                <span className="fw-semibold">{profile?.pincode || "--"}</span>
              </div>
            </div>
          </div>
        </div>
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
                      district: profile.district || profile.city,
                      pincode: profile.pincode,
                      avgDailyEarning: Number(profile.avgDailyEarning) || 0,
                      rainThresholdMm: Number(profile.rainThresholdMm) || 15
                    });
                    localStorage.setItem(
                      "partnerProfile",
                      JSON.stringify({
                        city: profile.city,
                        district: profile.district || profile.city,
                        pincode: profile.pincode,
                        avgEarning: Number(profile.avgDailyEarning) || 0,
                        threshold: Number(profile.rainThresholdMm) || 15
                      })
                    );
                    setActiveCity(profile.city || "");
                    await loadProfile();
                    await loadDashboardSummary();
                    await loadPayoutHistory(profile.city || "");
                    await loadRainCitySignals(Number(profile.rainThresholdMm) || 15);
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
                  <label className="form-label small">City &amp; Pincode</label>
                  <div className="position-relative">
                    <input
                      className="form-control form-control-sm"
                      value={profile.city}
                      placeholder="Type city name"
                      onChange={(e) => handleProfileCityChange(e.target.value)}
                      onFocus={handleProfileCityFocus}
                      onBlur={handleProfileCityBlur}
                      onKeyDown={handleProfileCityKeyDown}
                    />
                    {isProfileCityMenuOpen && citySuggestions.length > 0 ? (
                      <div className="ig-city-menu shadow-sm" role="listbox" aria-label="City suggestions">
                        {citySuggestions.map((entry, index) => (
                          <button
                            key={`${entry.city}-${entry.pincode}`}
                            type="button"
                            className={`ig-city-menu-item ${index === activeCitySuggestionIndex ? "is-active" : ""}`}
                            aria-selected={index === activeCitySuggestionIndex}
                            ref={(element) => {
                              citySuggestionItemRefs.current[index] = element;
                            }}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              applyCitySuggestion(entry);
                            }}
                            onMouseEnter={() => setActiveCitySuggestionIndex(index)}
                          >
                            <div className="ig-city-menu-name">{entry.city}</div>
                            <div className="ig-city-menu-meta">{entry.district}, {entry.state}</div>
                            <div className="ig-city-menu-badges">
                              <span className="badge text-bg-info">{entry.pincode}</span>
                              <span className={`badge ${riskBadgeClass(entry.risk)}`}>{entry.risk} Risk</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {cityAutoHint ? <div className="small text-success mt-1">{cityAutoHint}</div> : null}
                </div>
                <div className="mb-2">
                  <label className="form-label small">District (fallback if city unavailable)</label>
                  <input
                    className="form-control form-control-sm"
                    value={profile.district || ""}
                    onChange={(e) => setProfile((p) => ({ ...p, district: e.target.value }))}
                    placeholder="Enter district"
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
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="mb-0">Rain City Checker</h5>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => loadRainCitySignals()}
              disabled={rainCityLoading}
            >
              {rainCityLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="card card-glass shadow-sm">
            <div className="card-body">
              <div className="small text-muted mb-2">
                Claim threshold reference: <strong>{Number(profile?.rainThresholdMm || 15)} mm</strong>
              </div>
              {rainCityError ? <div className="alert alert-danger small mb-2">{rainCityError}</div> : null}
              <div className="list-group small">
                {rainCitySignals.length === 0 ? <div className="text-muted">No rain cities right now.</div> : null}
                {rainCitySignals.map((item) => (
                  <button
                    key={item.city}
                    type="button"
                    className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                    onClick={() => performSearch(item.city)}
                  >
                    <span>
                      {item.city}
                      <span className="text-muted ms-2">{item.condition}</span>
                    </span>
                    <span className={`badge ${item.eligible ? "text-bg-success" : "text-bg-secondary"}`}>
                      {item.rainMm.toFixed(1)} mm
                    </span>
                  </button>
                ))}
              </div>
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
