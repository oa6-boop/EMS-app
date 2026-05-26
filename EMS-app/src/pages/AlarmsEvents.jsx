import { useEffect, useState } from "react";
import { fetchIndustryAlarms, resolveAlarm } from "../api/industryApi";

const SEVERITY_STYLE = {
  high:   { bg: "#fff5f5", border: "#fed7d7", text: "#c53030" },
  medium: { bg: "#fffbeb", border: "#fefcbf", text: "#b7791f" },
  low:    { bg: "#f0fff4", border: "#c6f6d5", text: "#276749" },
};

const ALARM_TYPES_REF = [
  { type:"UNDERVOLTAGE",    severity:"high",   threshold:"< 218.5V (±5%)",   desc:"Voltage below nominal range" },
  { type:"OVERVOLTAGE",     severity:"high",   threshold:"> 241.5V (±5%)",   desc:"Voltage above nominal range" },
  { type:"UNDERFREQUENCY",  severity:"high",   threshold:"< 47.5Hz (±5%)",   desc:"Grid frequency too low"      },
  { type:"OVERFREQUENCY",   severity:"high",   threshold:"> 52.5Hz (±5%)",   desc:"Grid frequency too high"     },
  { type:"LOW_POWER_FACTOR",severity:"medium", threshold:"< 0.80",            desc:"Power factor below minimum"  },
  { type:"HIGH_THD",        severity:"medium", threshold:"> 8%",              desc:"Total Harmonic Distortion high" },
];

export default function AlarmsEvents() {
  const [alarms,   setAlarms]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("all");
  const [error,    setError]    = useState("");

  const loadAlarms = async () => {
    try {
      const result = await fetchIndustryAlarms();
      setAlarms(result || []);
      setError("");
    } catch (e) {
      setError("Cannot reach backend — check connection.");
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
      setAlarms(prev =>
        prev.map(a => a.id === id ? { ...a, status: "resolved" } : a)
      );
    }
  };

  const filtered = alarms.filter(a => {
    if (filter === "all")      return true;
    if (filter === "active")   return a.status    === "active";
    if (filter === "resolved") return a.status    === "resolved";
    if (filter === "high")     return a.severity  === "high";
    if (filter === "medium")   return a.severity  === "medium";
    return true;
  });

  const activeCount   = alarms.filter(a => a.status   === "active").length;
  const highCount     = alarms.filter(a => a.severity === "high").length;
  const mediumCount   = alarms.filter(a => a.severity === "medium").length;
  const resolvedCount = alarms.filter(a => a.status   === "resolved").length;

  return (
    <div className="overview-page">

      <div className="section-title-wrap">
        <h1>Alarms & Events</h1>
        <p>
          Flink real-time anomaly detection —{" "}
          <strong style={{ color: activeCount > 0 ? "#e53e3e" : "#38a169" }}>
            {activeCount} active
          </strong>
        </p>
      </div>

      {error && (
        <div style={{
          background: "#fff5f5", border: "1px solid #fed7d7",
          borderRadius: "8px", padding: "0.75rem 1rem",
          color: "#c53030", marginBottom: "1rem", fontSize: "0.85rem",
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPI Stats */}
      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Total Alarms</h4>
            <strong>{alarms.length}</strong>
            <span>From Flink engine</span>
          </div>
          <div className="carbon-card">
            <h4>🔴 Critical</h4>
            <strong style={{ color: highCount > 0 ? "#e53e3e" : "#38a169" }}>
              {highCount}
            </strong>
            <span>Immediate action required</span>
          </div>
          <div className="carbon-card">
            <h4>🟡 Medium</h4>
            <strong style={{ color: mediumCount > 0 ? "#d69e2e" : "#38a169" }}>
              {mediumCount}
            </strong>
            <span>Monitor closely</span>
          </div>
          <div className="carbon-card">
            <h4>✅ Resolved</h4>
            <strong style={{ color: "#38a169" }}>{resolvedCount}</strong>
            <span>Successfully handled</span>
          </div>
        </div>
      </section>

      {/* Filtres */}
      <div style={{ display:"flex", gap:"0.5rem", marginBottom:"1rem", flexWrap:"wrap" }}>
        {["all","active","resolved","high","medium"].map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            style={{
              padding:"0.3rem 0.9rem", borderRadius:"20px",
              border:"1px solid var(--border-color)", cursor:"pointer",
              fontSize:"0.82rem", fontWeight: filter === f ? 700 : 400,
              background: filter === f ? "#2563eb" : "var(--bg-card)",
              color:      filter === f ? "#fff"    : "var(--text-main)",
            }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Liste des alarmes */}
      <section className="section-block">
        {loading ? (
          <div className="info-box">⏳ Loading Flink alarms...</div>
        ) : filtered.length > 0 ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"0.6rem" }}>
            {filtered.map(alarm => {
              const sc = SEVERITY_STYLE[alarm.severity] || SEVERITY_STYLE.medium;
              const isActive = alarm.status === "active";
              return (
                <div key={alarm.id} style={{
                  background:   isActive ? sc.bg : "var(--bg-card)",
                  border:       `1px solid ${isActive ? sc.border : "var(--border-color)"}`,
                  borderLeft:   isActive ? `4px solid ${sc.text}` : "4px solid #38a169",
                  borderRadius: "10px", padding:"1rem 1.25rem",
                  display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", gap:"1rem",
                }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"0.4rem", flexWrap:"wrap" }}>
                      <span style={{ fontWeight:700, color: isActive ? sc.text : "#38a169", fontSize:"0.9rem" }}>
                        {alarm.alarm_type}
                      </span>
                      <span style={{
                        background: isActive ? sc.bg : "#f0fff4",
                        color:      isActive ? sc.text : "#38a169",
                        border:`1px solid ${isActive ? sc.border : "#c6f6d5"}`,
                        borderRadius:"8px", padding:"2px 8px",
                        fontSize:"0.72rem", fontWeight:700, textTransform:"uppercase",
                      }}>
                        {alarm.severity}
                      </span>
                      <span style={{
                        background: isActive ? "#fee2e2" : "#dcfce7",
                        color:      isActive ? "#dc2626" : "#16a34a",
                        borderRadius:"8px", padding:"2px 8px",
                        fontSize:"0.72rem", fontWeight:700,
                      }}>
                        {isActive ? "● ACTIVE" : "✓ RESOLVED"}
                      </span>
                      <span style={{
                        background:"#eff6ff", color:"#2563eb",
                        borderRadius:"8px", padding:"2px 8px",
                        fontSize:"0.72rem", fontWeight:600,
                      }}>
                        ⚡ Flink
                      </span>
                    </div>

                    <p style={{ fontSize:"0.85rem", color:"var(--text-secondary)", margin:"0 0 0.3rem" }}>
                      {alarm.message}
                    </p>

                    <div style={{ fontSize:"0.78rem", color:"var(--text-secondary)", display:"flex", gap:"1.5rem", flexWrap:"wrap" }}>
                      {alarm.plant           && <span>🏭 {alarm.plant}</span>}
                      {alarm.area            && <span>📦 {alarm.area}</span>}
                      {alarm.production_line && <span>🏗️ {alarm.production_line}</span>}
                      {alarm.equipment       && <span>⚙️ {alarm.equipment}</span>}
                      {alarm.measured_value != null && (
                        <span>📊 Measured: <strong>{Number(alarm.measured_value).toFixed(2)}</strong></span>
                      )}
                      {alarm.created_at && (
                        <span>🕐 {new Date(alarm.created_at).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>

                  {isActive ? (
                    <button type="button" onClick={() => handleResolve(alarm.id)}
                      style={{
                        background:"#16a34a", color:"#fff", border:"none",
                        borderRadius:"8px", padding:"0.45rem 1rem",
                        cursor:"pointer", fontWeight:600, fontSize:"0.82rem", flexShrink:0,
                      }}>
                      ✓ Resolve
                    </button>
                  ) : (
                    <span style={{ color:"#38a169", fontSize:"0.82rem", flexShrink:0 }}>✓ Resolved</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            textAlign:"center", padding:"3rem",
            background:"var(--bg-card)", borderRadius:"12px",
            border:"1px solid var(--border-color)", color:"var(--text-secondary)",
          }}>
            <div style={{ fontSize:"2.5rem", marginBottom:"0.75rem" }}>✅</div>
            <h3>No alarms — All parameters within range</h3>
            <p>Flink is monitoring voltage and frequency in real-time.</p>
            <p style={{ fontSize:"0.8rem", marginTop:"0.5rem", color:"#94a3b8" }}>
              Alarms trigger when voltage exits ±5% of 230V or frequency exits ±5% of 50Hz
            </p>
          </div>
        )}
      </section>

     

    </div>
  );
}