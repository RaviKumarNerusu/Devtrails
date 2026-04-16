import React, { useState } from "react";
import { Navigate, Route, Routes, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./authContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import AiRiskResultPage from "./pages/AiRiskResultPage.jsx";
import PlanSelectionPage from "./pages/PlanSelectionPage.jsx";
import PaymentPage from "./pages/PaymentPage.jsx";
import DisruptionAlertPage from "./pages/DisruptionAlertPage.jsx";
import PayoutSuccessPage from "./pages/PayoutSuccessPage.jsx";
import ClaimHistoryPage from "./pages/ClaimHistoryPage.jsx";
import AnalyticsDashboardPage from "./pages/AnalyticsDashboardPage.jsx";
import SupportPage from "./pages/SupportPage.jsx";
import ClaimsPage from "./pages/ClaimsPage.jsx";

// Protected Route Wrapper
function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function Shell() {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(false);
  const role = String(user?.role || "").toLowerCase();
  const isAdminView = role === "admin" || role === "insurer";

  return (
    <div className={`ig-app ${dark ? "bg-dark text-light" : "bg-light text-dark"} min-vh-100`}>
      <nav
        className={`navbar navbar-expand-lg ig-navbar shadow-sm ${
          dark ? "navbar-dark ig-navbar--dark bg-dark border-bottom border-secondary" : "navbar-dark"
        }`}
      >
        <div className="container">
          <Link className="navbar-brand fw-semibold d-flex align-items-center gap-2" to="/">
            <span className="ig-brand-mark">IG</span>
            <span>Income Guard</span>
          </Link>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#mainNavbar"
            aria-controls="mainNavbar"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse" id="mainNavbar">
            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
              <li className="nav-item">
                <Link to="/" className="nav-link">
                  Home
                </Link>
              </li>
              {user && (
                <>
                  <li className="nav-item">
                    <Link to="/app" className="nav-link">
                      Dashboard
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link to="/analytics" className="nav-link">
                      {isAdminView ? "Admin Analytics" : "Analytics"}
                    </Link>
                  </li>
                  {!isAdminView ? (
                    <li className="nav-item">
                      <Link to="/claim-history" className="nav-link">
                        Claim History
                      </Link>
                    </li>
                  ) : null}
                  <li className="nav-item">
                    <Link to="/support" className="nav-link">
                      {isAdminView ? "Support Control" : "Support"}
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link to="/plans" className="nav-link">
                      Plans
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link to="/claims" className="nav-link">
                      {isAdminView ? "Claims Control" : "Claims"}
                    </Link>
                  </li>
                </>
              )}
            </ul>
            <ul className="navbar-nav ms-auto align-items-center gap-2">
              <li className="nav-item d-flex align-items-center me-2 text-white-50 small">
                <div className="form-check form-switch mb-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="darkModeToggle"
                    checked={dark}
                    onChange={() => setDark(!dark)}
                  />
                  <label className="form-check-label ms-1" htmlFor="darkModeToggle">
                    {dark ? "Dark" : "Light"}
                  </label>
                </div>
              </li>
              {!user ? (
                <>
                  <li className="nav-item">
                    <Link to="/login" className="btn btn-outline-light btn-sm">
                      Login
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link to="/register" className="btn btn-light btn-sm text-primary fw-semibold">
                      Sign up
                    </Link>
                  </li>
                </>
              ) : (
                <>
                  <li className="nav-item text-white small me-2">
                    Hi, <strong>{user.name}</strong>
                  </li>
                  <li className="nav-item">
                    <button type="button" className="btn btn-outline-light btn-sm" onClick={logout}>
                      Logout
                    </button>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </nav>

      <main className="container py-5 ig-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/app"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/onboarding"
            element={
              <PrivateRoute>
                <OnboardingPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/ai-risk-result"
            element={
              <PrivateRoute>
                <AiRiskResultPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/plans"
            element={
              <PrivateRoute>
                <PlanSelectionPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/payment"
            element={
              <PrivateRoute>
                <PaymentPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/disruption-alerts"
            element={
              <PrivateRoute>
                <DisruptionAlertPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/payout-success"
            element={
              <PrivateRoute>
                <PayoutSuccessPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/claim-history"
            element={
              <PrivateRoute>
                <ClaimHistoryPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <PrivateRoute>
                <AnalyticsDashboardPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/support"
            element={
              <PrivateRoute>
                <SupportPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/policy"
            element={
              <PrivateRoute>
                <Navigate to="/plans" replace />
              </PrivateRoute>
            }
          />
          <Route
            path="/claims"
            element={
              <PrivateRoute>
                <ClaimsPage />
              </PrivateRoute>
            }
          />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}