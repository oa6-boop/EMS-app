import { useEffect, useState } from "react";
import { fetchAuditLogs } from "../api/auditApi";

const ACTION_COLORS = {
  "user_created":        { bg: "#f0fff4", color: "#276749", icon: "👤" },
  "user_deleted":        { bg: "#fff5f5", color: "#c53030", icon: "🗑️" },
  "login":               { bg: "#ebf8ff", color: "#2b6cb0", icon: "🔐" },
  "password_reset":      { bg: "#fffbeb", color: "#b7791f", icon: "🔑" },
  "logout":              { bg: "#f7fafc", color: "#718096", icon: "🚪" },
  "report_shared":       { bg: "#faf5ff", color: "#553c9a", icon: "📤" },
};

export default function AuditLogs() {
  const [logs,    setLogs]    = useState([]);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("all");

  useEffect(() => {
    const load = async () => {
      try {
        const token  = localStorage.getItem("token");
        const result = await fetchAuditLogs(token);
        setLogs(result || []);
      } catch (err) {
        setError(err.message || "Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  const uniqueActions = [...new Set(logs.map(l => l.action))];
  const filteredLogs  = filter === "all" ? logs : logs.filter(l => l.action === filter);

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Audit Logs</h1>
        </div>
        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          {logs.length} total records
        </span>
      </div>

      {error   && <div className="alarm-item">⚠ {error}</div>}
      {loading && <div className="info-box">⏳ Loading audit logs...</div>}

      {/* Stats */}
      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card"><h4>Total Actions</h4><strong>{logs.length}</strong><span>All recorded actions</span></div>
          <div className="carbon-card"><h4>Logins</h4><strong>{logs.filter(l => l.action === "login").length}</strong><span>Authentication events</span></div>
          <div className="carbon-card"><h4>Users Created</h4><strong>{logs.filter(l => l.action === "user_created").length}</strong><span>New accounts</span></div>
          <div className="carbon-card"><h4>Password Resets</h4><strong>{logs.filter(l => l.action === "password_reset").length}</strong><span>Security events</span></div>
        </div>
      </section>

      {/* Filtres */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setFilter("all")}
          style={{ padding: "0.3rem 0.9rem", borderRadius: "20px", border: "1px solid var(--border-color)", cursor: "pointer", fontSize: "0.82rem", fontWeight: filter === "all" ? 700 : 400, background: filter === "all" ? "#2563eb" : "var(--bg-card)", color: filter === "all" ? "#fff" : "var(--text-main)" }}>
          All
        </button>
        {uniqueActions.map(action => (
          <button key={action} type="button" onClick={() => setFilter(action)}
            style={{ padding: "0.3rem 0.9rem", borderRadius: "20px", border: "1px solid var(--border-color)", cursor: "pointer", fontSize: "0.82rem", fontWeight: filter === action ? 700 : 400, background: filter === action ? "#2563eb" : "var(--bg-card)", color: filter === action ? "#fff" : "var(--text-main)" }}>
            {(ACTION_COLORS[action]?.icon || "📋")} {action.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Table */}
      <section className="section-block">
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Performed By</th>
                <th>Target</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length > 0 ? (
                filteredLogs.map(log => {
                  const ac = ACTION_COLORS[log.action] || { bg: "#f7fafc", color: "#718096", icon: "📋" };
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: "0.78rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                      </td>
                      <td>
                        <span style={{ background: ac.bg, color: ac.color, borderRadius: "8px", padding: "2px 8px", fontSize: "0.78rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                          {ac.icon} {log.action?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.85rem" }}><strong>{log.performed_by || "—"}</strong></td>
                      <td style={{ fontSize: "0.85rem" }}>{log.target_user || "—"}</td>
                      <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{log.description || "—"}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
                    {loading ? "Loading..." : "No audit logs found."}
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