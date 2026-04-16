import React, { useEffect, useMemo, useState } from "react";
import { createSupportTicket, getAllSupportTickets, getMySupportTickets, updateSupportTicketStatus } from "../services/supportService.js";
import { useAuth } from "../authContext.jsx";

export default function SupportPage() {
  const { user } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const isAdminView = role === "admin" || role === "insurer";
  const [type, setType] = useState("bug");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusUpdatingId, setStatusUpdatingId] = useState("");
  const [error, setError] = useState("");

  const [tickets, setTickets] = useState([]);
  const [toast, setToast] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const items = isAdminView ? await getAllSupportTickets(statusFilter) : await getMySupportTickets();
        setTickets(items);
      } catch (err) {
        setError(err.message || "Failed to load tickets");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAdminView, statusFilter]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const statusBadgeClass = useMemo(() => {
    return (status) => {
      if (status === "resolved") return "badge bg-success";
      return "badge bg-warning text-dark";
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createSupportTicket({
        type,
        message,
        rating
      });

      setToast("Your issue has been submitted");
      setMessage("");
      setRating("");

      const items = await getMySupportTickets();
      setTickets(items);
    } catch (err) {
      setError(err.message || "Failed to submit issue");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (ticketId, status) => {
    setStatusUpdatingId(ticketId);
    setError("");
    try {
      await updateSupportTicketStatus(ticketId, status);
      const items = await getAllSupportTickets(statusFilter);
      setTickets(items);
      setToast("Ticket status updated");
    } catch (err) {
      setError(err.message || "Failed to update ticket status");
    } finally {
      setStatusUpdatingId("");
    }
  };

  return (
    <div className="row">
      <div className="col-lg-5">
        {toast ? (
          <div className="position-fixed bottom-0 end-0 m-3" style={{ zIndex: 1055 }}>
            <div className="alert alert-success mb-0 shadow-sm">{toast}</div>
          </div>
        ) : null}

        <h2 className="mb-3">Support / Helpline</h2>
        {isAdminView ? (
          <div className="card card-glass shadow-sm mb-3">
            <div className="card-body">
              <div className="fw-semibold mb-2">Admin support control</div>
              <div className="text-muted small mb-3">View all partner tickets and mark them as resolved.</div>
              <label className="form-label small">Status filter</label>
              <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
        ) : (
          <>
            <p className="text-muted mb-4">Create a ticket and track its status. We usually respond within 24 hours.</p>

            <div className="card card-glass shadow-sm mb-3">
              <div className="card-body">
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label small">Type</label>
                    <select className="form-select" value={type} onChange={(e) => setType(e.target.value)} required>
                      <option value="refund">Refund</option>
                      <option value="payout">Payout</option>
                      <option value="bug">Bug</option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small">Message</label>
                    <textarea
                      className="form-control"
                      rows="4"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe your issue..."
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label small">Optional rating</label>
                    <select className="form-select" value={rating} onChange={(e) => setRating(e.target.value)}>
                      <option value="">Not provided</option>
                      <option value="1">1 - Poor</option>
                      <option value="2">2 - Fair</option>
                      <option value="3">3 - Good</option>
                      <option value="4">4 - Very good</option>
                      <option value="5">5 - Excellent</option>
                    </select>
                  </div>

                  {error ? (
                    <div className="alert alert-danger" role="alert">
                      {error}
                    </div>
                  ) : null}

                  <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit ticket"}
                  </button>
                </form>
              </div>
            </div>

            <div className="text-muted small">
              Tip: For faster resolution, include your city and the date of the issue.
            </div>
          </>
        )}
      </div>

      <div className="col-lg-7">
        <h2 className="mb-3">{isAdminView ? "All support tickets" : "Your tickets"}</h2>
        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div>Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="alert alert-secondary" role="alert">
            No tickets submitted yet.
          </div>
        ) : (
          <div className="list-group">
            {tickets.map((t) => (
              <div key={t._id} className="list-group-item">
                <div className="d-flex justify-content-between gap-3 align-items-start">
                  <div>
                    <div className="d-flex gap-2 align-items-center flex-wrap">
                      <span className="fw-semibold text-capitalize">{t.type}</span>
                      <span className={statusBadgeClass(t.status)}>{t.status}</span>
                      {typeof t.rating === "number" && t.rating > 0 ? (
                        <span className="badge bg-light text-dark border">Rating: {t.rating}/5</span>
                      ) : null}
                    </div>
                    <div className="text-muted mt-2 small" style={{ whiteSpace: "pre-wrap" }}>
                      {t.message}
                    </div>
                    {isAdminView ? (
                      <div className="small mt-2 text-muted">
                        By: <span className="fw-semibold">{t.userId?.name || "Unknown"}</span> ({t.userId?.email || "-"})
                      </div>
                    ) : null}
                  </div>
                  <div className="text-end">
                    <div className="small text-muted">
                      {t.createdAt
                        ? new Date(t.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                        : ""}
                    </div>
                    {isAdminView ? (
                      <div className="mt-2">
                        <button
                          className="btn btn-sm btn-outline-success"
                          disabled={statusUpdatingId === t._id || t.status === "resolved"}
                          onClick={() => handleStatusChange(t._id, "resolved")}
                        >
                          {statusUpdatingId === t._id ? "Updating..." : t.status === "resolved" ? "Resolved" : "Mark resolved"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

