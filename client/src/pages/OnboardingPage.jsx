import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/apiClient.js";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState({
    city: "",
    pincode: "",
    avgDailyEarning: "",
    rainThresholdMm: 15
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadExisting() {
      try {
        const { data } = await api.get("/partner/profile");
        if (data && data.profile) {
          setProfile({
            city: data.profile.city || "",
            pincode: data.profile.pincode || "",
            avgDailyEarning: data.profile.avgDailyEarning?.toString() || "",
            rainThresholdMm: data.profile.rainThresholdMm || 15
          });
        }
      } catch {
        // ignore
      }
    }
    loadExisting();
  }, []);

  const handleChange = (field) => (e) => {
    setProfile((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
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
      navigate("/ai-risk-result");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="row justify-content-center">
      <div className="col-lg-6">
        <h2 className="mb-2">Onboarding – Tell us about your work</h2>
        <p className="text-muted mb-4">
          We use these details to personalise your rain disruption risk and recommended payout amount.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">City</label>
            <input
              className="form-control"
              value={profile.city}
              onChange={handleChange("city")}
              placeholder="Your primary working city"
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Pincode</label>
            <input
              className="form-control"
              value={profile.pincode}
              onChange={handleChange("pincode")}
              placeholder="Where you usually start your day"
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Average daily earning (₹)</label>
            <input
              type="number"
              className="form-control"
              value={profile.avgDailyEarning}
              onChange={handleChange("avgDailyEarning")}
              min={0}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label">Rain threshold (mm)</label>
            <input
              type="number"
              className="form-control"
              value={profile.rainThresholdMm}
              onChange={handleChange("rainThresholdMm")}
              min={0}
              required
            />
            <div className="form-text">
              Above this rainfall level, we treat your workday as heavily disrupted and trigger higher payouts.
            </div>
          </div>
          <button className="btn btn-primary w-100" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Continue to AI risk result"}
          </button>
        </form>
      </div>
    </div>
  );
}

