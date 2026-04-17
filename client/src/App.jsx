import React, { useState } from "react";
import { Navigate, Outlet, Route, Routes, Link } from "react-router-dom";
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
import AdminLayout from "./pages/AdminLayout.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminClaimsPage from "./pages/AdminClaimsPage.jsx";
import AdminAnalyticsPage from "./pages/AdminAnalyticsPage.jsx";
import AdminFraudPage from "./pages/AdminFraudPage.jsx";
import AdminSupportPage from "./pages/AdminSupportPage.jsx";
import IncomeGuardAIChatbot from "./components/GigGuardChatbot.jsx";

function normalizeRole(role) {
  return String(role || "").toLowerCase();
}

function isAdminRole(role) {
  const value = normalizeRole(role);
  return value === "admin" || value === "insurer";
}

function resolveHomePath(role) {
  return isAdminRole(role) ? "/admin/dashboard" : "/dashboard";
}

// Protected Route Wrapper
function PrivateRoute({ children, requireAdmin = false, requireWorker = false }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdminRole(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireWorker && isAdminRole(user.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}

function PublicOnlyRoute({ children }) {
  const { user } = useAuth();
  if (user) {
    return <Navigate to={resolveHomePath(user.role)} replace />;
  }
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) {
    return <LandingPage />;
  }
  return <Navigate to={resolveHomePath(user.role)} replace />;
}

function LegacyAppRedirect() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={resolveHomePath(user.role)} replace />;
}

function WorkerShell() {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(false);

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
                    <Link to="/dashboard" className="nav-link">
                      Dashboard
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link to="/analytics" className="nav-link">
                      Analytics
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link to="/claim-history" className="nav-link">
                      Claim History
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link to="/support" className="nav-link">
                      Support
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link to="/plans" className="nav-link">
                      Plans
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link to="/claims" className="nav-link">
                      Claims
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
        <Outlet />
      </main>
    </div>
  );
}

function Shell() {
  return (
    <Routes>
      <Route element={<WorkerShell />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <PrivateRoute requireWorker>
              <DashboardPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/app"
          element={
            <PrivateRoute>
              <LegacyAppRedirect />
            </PrivateRoute>
          }
        />

        <Route
          path="/onboarding"
          element={
            <PrivateRoute requireWorker>
              <OnboardingPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/ai-risk-result"
          element={
            <PrivateRoute requireWorker>
              <AiRiskResultPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/plans"
          element={
            <PrivateRoute requireWorker>
              <PlanSelectionPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/payment"
          element={
            <PrivateRoute requireWorker>
              <PaymentPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/disruption-alerts"
          element={
            <PrivateRoute requireWorker>
              <DisruptionAlertPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/payout-success"
          element={
            <PrivateRoute requireWorker>
              <PayoutSuccessPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/claim-history"
          element={
            <PrivateRoute requireWorker>
              <ClaimHistoryPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <PrivateRoute requireWorker>
              <AnalyticsDashboardPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/support"
          element={
            <PrivateRoute requireWorker>
              <SupportPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/policy"
          element={
            <PrivateRoute requireWorker>
              <Navigate to="/plans" replace />
            </PrivateRoute>
          }
        />
        <Route
          path="/claims"
          element={
            <PrivateRoute requireWorker>
              <ClaimsPage />
            </PrivateRoute>
          }
        />
      </Route>

      <Route
        path="/admin"
        element={
          <PrivateRoute requireAdmin>
            <AdminLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="claims" element={<AdminClaimsPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="fraud" element={<AdminFraudPage />} />
        <Route path="support" element={<AdminSupportPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
      <IncomeGuardAIChatbot />
    </AuthProvider>
  );
}