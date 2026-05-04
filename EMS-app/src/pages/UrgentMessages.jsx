import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function UrgentMessages({ requests, onRegeneratePassword }) {
  const [visiblePasswords, setVisiblePasswords] = useState({});

  const toggle = id => setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));

  const pending  = requests.filter(r => r.status === "pending");
  const resolved = requests.filter(r => r.status === "resolved");

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Urgent Messages — Password Resets</h1>
        <p>Manage forgot-password requests from users — admin only</p>
      </div>

      {/* Stats */}
      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Total Requests</h4>
            <strong>{requests.length}</strong>
            <span>All password resets</span>
          </div>
          <div className="carbon-card">
            <h4>🟡 Pending</h4>
            <strong style={{ color: pending.length > 0 ? "#d69e2e" : "#38a169" }}>{pending.length}</strong>
            <span>Awaiting action</span>
          </div>
          <div className="carbon-card">
            <h4>✅ Resolved</h4>
            <strong style={{ color: "#38a169" }}>{resolved.length}</strong>
            <span>Already handled</span>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="section-block">
        <div className="table-card">
          <table className="urgent-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Generated Password</th>
                <th>Resolved At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.length > 0 ? (
                requests.map(req => (
                  <tr key={req.id}>
                    <td><strong>{req.email}</strong></td>
                    <td>
                      <span className={`status ${req.status}`}>
                        {req.status === "pending" ? "🟡 Pending" : "✅ Resolved"}
                      </span>
                    </td>
                    <td>
                      {req.generated_password ? (
                        <div className="password-box">
                          <span className="password-text">
                            {visiblePasswords[req.id] ? req.generated_password : "••••••••"}
                          </span>
                          <button type="button" className="eye-btn" onClick={() => toggle(req.id)}>
                            {visiblePasswords[req.id]
                              ? <EyeOff size={16} className="eye-icon" />
                              : <Eye    size={16} className="eye-icon" />
                            }
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Not generated yet</span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      {req.resolved_at ? new Date(req.resolved_at).toLocaleString() : "—"}
                    </td>
                    <td>
                      {req.status === "pending" ? (
                        <button type="button" className="btn-generate" onClick={() => onRegeneratePassword(req.id)}>
                          Generate Password
                        </button>
                      ) : (
                        <span className="done">✓ Done</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
                    ✅ No pending urgent requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}