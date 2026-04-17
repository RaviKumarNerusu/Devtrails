import React, { useEffect, useState } from "react";
import {
  getAllSupportTickets,
  replySupportTicket,
  updateSupportTicketStatus
} from "../services/supportService.js";

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [replyText, setReplyText] = useState({});
  const [replyLoading, setReplyLoading] = useState("");

  const loadTickets = async (status = statusFilter) => {
    const normalizedStatus = status === "all" ? "" : status;
    const items = await getAllSupportTickets(normalizedStatus);
    setTickets(items || []);
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        await loadTickets("all");
      } catch (err) {
        setError(err?.message || "Failed to load support tickets");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const handleStatusChange = async (ticketId, status) => {
    setReplyLoading(ticketId);
    setError("");
    try {
      await updateSupportTicketStatus(ticketId, status);
      setTickets((prev) => prev.map((item) => (String(item._id) === String(ticketId) ? { ...item, status } : item)));
    } catch (err) {
      setError(err?.message || "Failed to update status");
    } finally {
      setReplyLoading("");
    }
  };

  const handleReply = async (ticketId) => {
    const reply = String(replyText[ticketId] || "").trim();
    if (!reply) {
      setError("Reply message is required");
      return;
    }

    setReplyLoading(ticketId);
    setError("");
    try {
      const updated = await replySupportTicket({ ticketId, reply, status: "resolved" });
      if (updated) {
        setTickets((prev) => prev.map((item) => (String(item._id) === String(ticketId) ? updated : item)));
      }
      setReplyText((prev) => ({ ...prev, [ticketId]: "" }));
    } catch (err) {
      setError(err?.message || "Failed to send reply");
    } finally {
      setReplyLoading("");
    }
  };

  if (loading) return <div>Loading support tickets...</div>;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h4 mb-0">Admin Support</h2>
        <div style={{ maxWidth: 220 }}>
          <select
            className="form-select form-select-sm"
            value={statusFilter}
            onChange={async (e) => {
              const value = e.target.value;
              setStatusFilter(value);
              try {
                await loadTickets(value);
              } catch (err) {
                setError(err?.message || "Failed to filter tickets");
              }
            }}
          >
            <option value="all">All tickets</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="card admin-panel-card">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>User</th>
                <th>Message</th>
                <th>Status</th>
                <th>Reply</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    No support tickets available.
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => {
                  const ticketId = String(ticket._id || "");
                  const isBusy = replyLoading === ticketId;

                  return (
                    <tr key={ticketId}>
                      <td>
                        <div className="fw-semibold">{ticket?.userId?.name || "Unknown user"}</div>
                        <div className="small text-muted">{ticket?.userId?.email || "-"}</div>
                      </td>
                      <td>
                        <div className="small">{ticket.message}</div>
                        {ticket.adminReply ? (
                          <div className="small text-success mt-2">
                            Reply: {ticket.adminReply}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge ${ticket.status === "resolved" ? "text-bg-success" : "text-bg-warning"}`}>
                          {ticket.status}
                        </span>
                      </td>
                      <td style={{ minWidth: 260 }}>
                        <input
                          className="form-control form-control-sm"
                          placeholder="Write a reply"
                          value={replyText[ticketId] || ""}
                          onChange={(e) => setReplyText((prev) => ({ ...prev, [ticketId]: e.target.value }))}
                        />
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleReply(ticketId)}
                            disabled={isBusy}
                          >
                            {isBusy ? "Replying..." : "Reply"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success"
                            onClick={() => handleStatusChange(ticketId, "resolved")}
                            disabled={isBusy || ticket.status === "resolved"}
                          >
                            Mark as resolved
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
