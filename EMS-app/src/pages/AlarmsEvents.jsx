import { useEffect, useState } from "react";
import { fetchIndustryAlarms, resolveAlarm } from "../api/industryApi";

export default function AlarmsEvents({ data = {}, energies = [] }) {
  const [alarms,    setAlarms]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState("all");
  const [error,     setError]     = useState("");

  const loadAlarms = async () => {
    try {
      const result = await fetchIndustryAlarms();
      setAlarms(result || []);
      setError("");
    } catch {
      // Fallback: générer des alarmes depuis les données locales
      const localAlarms = [];
      const tension = data.tension ?? 415;
      const thd     = data.thd     ?? 3.2;
      const pf      = data.facteurPuissance ?? 0.94;

      if (tension < 380 || tension > 440) {
        localAlarms.push({ id: "v1", alarm_type: "VOLTAGE_ANOMALY", severity: "high", message: `Voltage ${tension.toFixed(1)}V outside [380-440V]`, status: "active", production_line: "Current Line", equipment: "—", measured_value: tension, limit_value: 415 });
      }
      if (thd > 5) {
        localAlarms.push({ id: "t1", alarm_type: "HIGH_THD", severity: "medium", message: `THD ${thd.toFixed(2)}% exceeds 5%`, status: "active", production_line: "Current Line", equipment: "—", measured_value: thd, limit_value: 5 });
      }
      if (pf < 0.85) {
        localAlarms.push({ id: "p1", alarm_type: "LOW_POWER_FACTOR", severity: "medium", message: `Power Factor ${pf.toFixed(3)} below 0.85`, status: "active", production_line: "Current Line", equipment: "—", measured_value: pf, limit_value: 0.85 });
      }
      energies.forEach(e => {
        if (e.value > e.max * 0.9) {
          localAlarms.push({ id: `e${e.id}`, alarm_type: "HIGH_CONSUMPTION", severity: "medium", message: `${e.name} near threshold: ${e.value.toFixed(2)} ${e.unit}`, status: "active", production_line: "Current Line", equipment: e.rawData?.equipment || "—", measured_value: e.value, limit_value: e.max });
        }
      });
      setAlarms(localAlarms);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlarms();
    const iv = setInterval(loadAlarms, 5000);
    return () => clearInterval(iv);
  }, []);

  const handleResolve = async (id) => {
    try {
      await resolveAlarm(id);
      loadAlarms();
    } catch {
      setAlarms(prev => prev.map(a => a.id === id ? { ...a, status: "resolved" } : a));
    }
  };

  const filteredAlarms = filter === "all" ? alarms : alarms.filter(a =>
    filter === "active"   ? a.status   === "active"   :
    filter === "resolved" ? a.status   === "resolved" :
    filter === "high"     ? a.severity === "high"     :
    a.severity === "medium"
  );

  const activeCount   = alarms.filter(a => a.status   === "active").length;
  const highCount     = alarms.filter(a => a.severity === "high").length;
  const mediumCount   = alarms.filter(a => a.severity === "medium").length;
  const resolvedCount = alarms.filter(a => a.status   === "resolved").length;

  const severityStyle = {
    high:   { bg: "#fff5f5", border: "#fed7d7", text: "#c53030" },
    medium: { bg: "#fffbeb", border: "#fefcbf", text: "#b7791f" },
    low:    { bg: "#f0fff4", border: "#c6f6d5", text: "#276749" },
  };

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Alarms & Events</h1>
        <p>Automatic alarms measurements — {activeCount} active</p>
      </div>

      {error && <div className="alarm-item">⚠ {error}</div>}

      {/* Stats */}
      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Total Alarms</h4>
            <strong>{alarms.length}</strong>
          </div>
          <div className="carbon-card">
            <h4>🔴 High</h4>
            <strong style={{ color: highCount > 0 ? "#e53e3e" : "#38a169" }}>{highCount}</strong>
            <span>Immediate action required</span>
          </div>
          <div className="carbon-card">
            <h4>🟡 Medium</h4>
            <strong style={{ color: mediumCount > 0 ? "#d69e2e" : "#38a169" }}>{mediumCount}</strong>
            <span>Monitor closely</span>
          </div>
          <div className="carbon-card">
            <h4>✅ Resolved</h4>
            <strong style={{ color: "#38a169" }}>{resolvedCount}</strong>
            <span>Successfully resolved</span>
          </div>
        </div>
      </section>

      {/* Filtres */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {["all", "active", "high", "medium", "resolved"].map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            style={{
              padding: "0.3rem 0.9rem", borderRadius: "20px",
              border: "1px solid var(--border-color)", cursor: "pointer",
              fontSize: "0.82rem", fontWeight: filter === f ? 700 : 400,
              background: filter === f ? "#2563eb" : "var(--bg-card)",
              color:      filter === f ? "#fff"    : "var(--text-main)",
            }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Tableau des alarmes */}
      <section className="section-block">
        {loading ? (
          <div className="info-box">⏳ Loading alarms from backend...</div>
        ) : filteredAlarms.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {filteredAlarms.map(alarm => {
              const sc      = severityStyle[alarm.severity] || severityStyle.medium;
              const isActive = alarm.status === "active";
              return (
                <div key={alarm.id} style={{
                  background:   isActive ? sc.bg : "var(--bg-card)",
                  border:       `1px solid ${isActive ? sc.border : "var(--border-color)"}`,
                  borderLeft:   isActive ? `4px solid ${sc.text}` : "4px solid #38a169",
                  borderRadius: "10px", padding: "1rem 1.25rem",
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
                      <span style={{ fontWeight: 700, color: isActive ? sc.text : "#38a169", fontSize: "0.9rem" }}>
                        {alarm.alarm_type}
                      </span>
                      <span style={{
                        background: isActive ? sc.bg : "#f0fff4",
                        color:      isActive ? sc.text : "#38a169",
                        border:     `1px solid ${isActive ? sc.border : "#c6f6d5"}`,
                        borderRadius: "8px", padding: "2px 8px",
                        fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
                      }}>
                        {alarm.severity}
                      </span>
                      <span style={{
                        background: isActive ? "#fff5f5" : "#f0fff4",
                        color:      isActive ? "#e53e3e" : "#38a169",
                        borderRadius: "8px", padding: "2px 8px",
                        fontSize: "0.72rem", fontWeight: 700,
                      }}>
                        {alarm.status}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 0.3rem" }}>
                      {alarm.message}
                    </p>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                      <span>📍 {alarm.production_line || "—"}</span>
                      <span>⚙️ {alarm.equipment || "—"}</span>
                      {alarm.measured_value != null && <span>📊 Value: <strong>{alarm.measured_value}</strong></span>}
                      {alarm.limit_value    != null && <span>⚠️ Limit: {alarm.limit_value}</span>}
                      {alarm.created_at && <span>🕐 {new Date(alarm.created_at).toLocaleTimeString()}</span>}
                    </div>
                  </div>
                  {isActive && (
                    <button type="button" onClick={() => handleResolve(alarm.id)}
                      style={{
                        background: "#38a169", color: "#fff", border: "none",
                        borderRadius: "8px", padding: "0.45rem 1rem",
                        cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", flexShrink: 0,
                      }}>
                      ✓ Resolve
                    </button>
                  )}
                  {!isActive && (
                    <span style={{ color: "#38a169", fontSize: "0.82rem", flexShrink: 0 }}>✓ Resolved</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "3rem", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✅</div>
            <h3>No alarms found</h3>
            <p>All parameters are within acceptable ranges.</p>
          </div>
        )}
      </section>

      {/* Types d'alarmes */}
      <section className="section-block">
        <div className="section-title-wrap"><h2>Alarm Types Reference</h2><p>Automatic detection thresholds</p></div>
        <div className="carbon-kpis">
          {[
            { type: "HIGH_CONSUMPTION",  severity: "high",   threshold: "> configured kW",   description: "Active power exceeds configured threshold" },
            { type: "VOLTAGE_ANOMALY",   severity: "high",   threshold: "< min or > max V",   description: "Voltage outside configured range" },
            { type: "FREQUENCY_ANOMALY", severity: "high",   threshold: "< min or > max Hz",  description: "Frequency outside acceptable range" },
            { type: "LOW_POWER_FACTOR",  severity: "medium", threshold: "< configured PF",    description: "Power factor below minimum" },
            { type: "HIGH_THD",          severity: "medium", threshold: "> configured %",     description: "Total Harmonic Distortion too high" },
          ].map(item => {
            const sc = severityStyle[item.severity];
            return (
              <div key={item.type} className="carbon-card" style={{ borderLeft: `3px solid ${sc.text}` }}>
                <h4 style={{ color: sc.text, fontSize: "0.78rem" }}>{item.type}</h4>
                <strong style={{ fontSize: "0.82rem" }}>{item.threshold}</strong>
                <span>{item.description}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}