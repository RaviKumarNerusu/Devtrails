import React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext.jsx";

function navClass({ isActive }) {
  return `admin-nav-link ${isActive ? "active" : ""}`;
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="admin-shell min-vh-100">
      <aside className="admin-sidebar">
        <div className="admin-brand-wrap">
          <Link className="admin-brand" to="/admin/dashboard">
            <span className="admin-brand-mark">IG</span>
            <div>
              <div className="admin-brand-title">Income Guard</div>
              <div className="admin-brand-sub">Insurer Control Panel</div>
            </div>
          </Link>
        </div>

        <nav className="admin-nav" aria-label="Admin navigation">
          <NavLink to="/admin/dashboard" className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/admin/claims" className={navClass}>
            Claims
          </NavLink>
          <NavLink to="/admin/analytics" className={navClass}>
            Analytics
          </NavLink>
          <NavLink to="/admin/fraud" className={navClass}>
            Fraud
          </NavLink>
          <NavLink to="/admin/support" className={navClass}>
            Support
          </NavLink>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="small text-muted">Signed in as</div>
          <div className="fw-semibold mb-3">{user?.name || "Admin"}</div>
          <button type="button" className="btn btn-sm btn-outline-danger w-100" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <section className="admin-content-wrap">
        <header className="admin-topbar">
          <h1 className="admin-title mb-0">Admin Console</h1>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
