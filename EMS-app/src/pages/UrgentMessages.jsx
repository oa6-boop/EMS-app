import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function UrgentMessages({ requests = [], onRegeneratePassword }) {
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [loadingId,        setLoadingId]        = useState(null);
  const [copyMsg,          setCopyMsg]          = useState("");

  const toggle = id =>
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));

  const handleRegenerate = async (id) => {
    setLoadingId(id);
    await onRegeneratePassword(id);
    setLoadingId(null);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopyMsg("Copied!");
    setTimeout(() => setCopyMsg(""), 2000);
  };

  const pending  = requests.filter(r => r.status === "pending");
  const resolved = requests.filter(r => r.status === "resolved");

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Urgent Messages — Password Resets</h1>
          <p className="page-subtitle">
          </p>
        </div>
        {pending.length > 0 && (
          <span style={{
            background: "#fff5f5", color: "#c53030",
            border: "1px solid #fed7d7", borderRadius: "10px",
            padding: "6px 16px", fontWeight: 700, fontSize: "0.88rem",
          }}>
            🔴 {pending.length} pending
          </span>
        )}
      </div>

      {copyMsg && (
        <div className="info-box" style={{ marginBottom: "0.5rem" }}>
          ✅ {copyMsg}
        </div>
      )}

      {/* Stats */}
      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Total Requests</h4>
            <strong>{requests.length}</strong>
            <span>All password reset requests</span>
          </div>
          <div className="carbon-card">
            <h4>🟡 Pending</h4>
            <strong style={{ color: pending.length > 0 ? "#d69e2e" : "#38a169" }}>
              {pending.length}
            </strong>
            <span>Awaiting admin action</span>
          </div>
          <div className="carbon-card">
            <h4>✅ Resolved</h4>
            <strong style={{ color: "#38a169" }}>{resolved.length}</strong>
            <span>Already handled</span>
          </div>
        </div>
      </section>

      {/* Pending d'abord */}
      {pending.length > 0 && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>🟡 Pending Requests</h2>
            <p>These users need a new password</p>
          </div>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Requested At</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(req => (
                  <tr key={req.id}>
                    <td><strong>{req.email}</strong></td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      {req.requested_at
                        ? new Date(req.requested_at).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      <span style={{
                        background: "#fffbeb", color: "#d69e2e",
                        border: "1px solid #fbd38d",
                        borderRadius: "8px", padding: "3px 10px",
                        fontSize: "0.78rem", fontWeight: 700,
                      }}>
                        🟡 Pending
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={loadingId === req.id}
                        onClick={() => handleRegenerate(req.id)}
                        style={{
                          background: loadingId === req.id ? "#94a3b8" : "#2563eb",
                          color: "#fff", border: "none", borderRadius: "8px",
                          padding: "6px 14px", cursor: loadingId === req.id ? "default" : "pointer",
                          fontWeight: 600, fontSize: "0.82rem",
                        }}
                      >
                        {loadingId === req.id ? "Generating..." : "🔑 Generate Password"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>✅ Resolved Requests</h2>
            <p>Passwords already generated — communicate these to the users</p>
          </div>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Generated Password</th>
                  <th>Resolved At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map(req => (
                  <tr key={req.id}>
                    <td><strong>{req.email}</strong></td>
                    <td>
                      {req.generated_password ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{
                            fontFamily: "monospace", fontSize: "0.9rem",
                            background: "var(--bg-main)", padding: "3px 8px",
                            borderRadius: "6px", border: "1px solid var(--border-color)",
                            letterSpacing: "1px",
                          }}>
                            {visiblePasswords[req.id]
                              ? req.generated_password
                              : "••••••••••"}
                          </span>
                          <button type="button"
                            onClick={() => toggle(req.id)}
                            style={{
                              background: "transparent", border: "none",
                              cursor: "pointer", color: "var(--text-secondary)",
                              padding: "2px",
                            }}>
                            {visiblePasswords[req.id]
                              ? <EyeOff size={16} />
                              : <Eye    size={16} />}
                          </button>
                          {visiblePasswords[req.id] && (
                            <button type="button"
                              onClick={() => handleCopy(req.generated_password)}
                              style={{
                                background: "#ebf8ff", color: "#2b6cb0",
                                border: "1px solid #bee3f8", borderRadius: "6px",
                                padding: "2px 8px", cursor: "pointer",
                                fontSize: "0.75rem", fontWeight: 600,
                              }}>
                              Copy
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      {req.resolved_at
                        ? new Date(req.resolved_at).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      <span style={{
                        background: "#f0fff4", color: "#276749",
                        border: "1px solid #c6f6d5",
                        borderRadius: "8px", padding: "3px 10px",
                        fontSize: "0.78rem", fontWeight: 700,
                      }}>
                        ✅ Resolved
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Aucune demande */}
      {requests.length === 0 && (
        <section className="section-block">
          <div style={{
            textAlign: "center", padding: "3rem",
            color: "var(--text-secondary)",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✅</div>
            <strong>No urgent requests</strong>
            <p style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
              When a user clicks "Forgot Password", their request will appear here.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}