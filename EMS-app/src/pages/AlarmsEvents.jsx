import { useEffect, useState } from "react";
import { fetchIndustryAlarms, resolveAlarm } from "../api/industryApi";
import TagFilter from "../components/TagFilter.jsx";

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

// Seuls l'admin et le technicien maintenance peuvent resoudre les alarmes.
// L'operateur est observateur (read-only). Le management n'a pas acces a la page.
const ROLES_ALLOWED_TO_RESOLVE = ["admin", "maintenance"];

export default function AlarmsEvents({
  userRole = "",
  energies = [],
  availableTags = [],
  selectedTag = "",
  onTagSelect,
}) {
  const [alarms,   setAlarms]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("all");
  const [error,    setError]    = useState("");

  // Test insensible a la casse/espaces pour gerer "Operator", "ADMIN", etc.
  const canResolve = ROLES_ALLOWED_TO_RESOLVE.includes(
    String(userRole).toLowerCase().trim()
  );

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
    if (!canResolve) return;

    try {
      await resolveAlarm(id);
      loadAlarms();
    } catch {
      setAlarms(prev =>
        prev.map(a => a.id === id ? { ...a, status: "resolved" } : a)
      );
    }
  };

  const allowedEquipmentsForTag = new Set(
    energies.map((e) => e.equipment).filter(Boolean)
  );

  const tagScopedAlarms = alarms.filter(a => {
    if (!selectedTag) return true;
    if (!allowedEquipmentsForTag.size) return false;
    return allowedEquipmentsForTag.has(a.equipment);
  });

  const filtered = tagScopedAlarms.filter(a => {
    if (filter === "all")      return true;
    if (filter === "active")   return a.status    === "active";
    if (filter === "resolved") return a.status    === "resolved";
    if (filter === "high")     return a.severity  === "high";
    if (filter === "medium")   return a.severity  === "medium";
    return true;
  });

  const activeCount   = tagScopedAlarms.filter(a => a.status   === "active").length;
  const highCount     = tagScopedAlarms.filter(a => a.severity === "high").length;
  const mediumCount   = tagScopedAlarms.filter(a => a.severity === "medium").length;
  const resolvedCount = tagScopedAlarms.filter(a => a.status   === "resolved").length;

  return (
    <div className="overview-page">

      <div className="overview-header-row">
        <div>
          <h1>Alarms & Events</h1>
          <p className="page-subtitle">
            Power quality alarms detected in real-time
            {selectedTag ? ` — #${selectedTag}` : ""}
            {!canResolve && " — observer mode (read-only)"}
          </p>
        </div>

        <span className="live-label" style={{ fontSize: "0.9rem" }}>
          ● Live
        </span>
      </div>

      {error && <div className="alarm-item">⚠ {error}</div>}

      <TagFilter
        availableTags={availableTags}
        selectedTag={selectedTag}
        onTagSelect={onTagSelect}
      />

      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>🔴 Active</h4>
            <strong style={{ color: "#e53e3e" }}>{activeCount}</strong>
          </div>

          <div className="carbon-card">
            <h4>⚠️ High</h4>
            <strong style={{ color: "#c53030" }}>{highCount}</strong>
          </div>

          <div className="carbon-card">
            <h4>🟡 Medium</h4>
            <strong style={{ color: "#b7791f" }}>{mediumCount}</strong>
          </div>

          <div className="carbon-card">
            <h4>✅ Resolved</h4>
            <strong style={{ color: "#38a169" }}>{resolvedCount}</strong>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="filter-chip-row" style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap", marginBottom:"1rem" }}>
          {["all","active","resolved","high","medium"].map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding:"0.4rem 1rem",
                borderRadius:"999px",
                border: filter === f ? "1.5px solid #2563eb" : "1px solid #dbe3ef",
                background: filter === f ? "#2563eb" : "var(--bg-card)",
                color: filter === f ? "#fff" : "var(--text-main)",
                cursor:"pointer",
                fontWeight: filter === f ? 700 : 500,
                fontSize:"0.82rem",
                textTransform:"capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding:"3rem", color:"var(--text-secondary)" }}>
            Loading alarms…
          </div>
        ) : filtered.length > 0 ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
            {filtered.map(alarm => {
              const isActive = alarm.status === "active";
              const style = SEVERITY_STYLE[alarm.severity] || SEVERITY_STYLE.low;

              return (
                <div
                  key={alarm.id}
                  style={{
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"space-between",
                    gap:"1rem",
                    background: style.bg,
                    border:`1px solid ${style.border}`,
                    borderRadius:"12px",
                    padding:"1rem 1.25rem",
                  }}
                >
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"0.6rem", marginBottom:"0.4rem", flexWrap:"wrap" }}>
                      <strong style={{ color: style.text, fontSize:"0.95rem" }}>
                        {alarm.alarm_type}
                      </strong>
                      <span style={{
                        fontSize:"0.7rem", fontWeight:700, textTransform:"uppercase",
                        color: style.text, background:"#fff",
                        border:`1px solid ${style.border}`,
                        borderRadius:"6px", padding:"1px 8px",
                      }}>
                        {alarm.severity}
                      </span>
                    </div>

                    {alarm.message && (
                      <p style={{ margin:"0 0 0.4rem 0", fontSize:"0.85rem", color:"var(--text-main)" }}>
                        {alarm.message}
                      </p>
                    )}

                    <div style={{ display:"flex", flexWrap:"wrap", gap:"0.75rem", fontSize:"0.78rem", color:"var(--text-secondary)" }}>
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
                    canResolve ? (
                      <button type="button" onClick={() => handleResolve(alarm.id)}
                        style={{
                          background:"#16a34a", color:"#fff", border:"none",
                          borderRadius:"8px", padding:"0.45rem 1rem",
                          cursor:"pointer", fontWeight:600, fontSize:"0.82rem", flexShrink:0,
                        }}>
                        ✓ Resolve
                      </button>
                    ) : (
                      <span style={{ color:"#e53e3e", fontSize:"0.82rem", fontWeight:600, flexShrink:0 }}>● Active</span>
                    )
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
            color:"var(--text-secondary)",
          }}>
            No alarms match this filter.
          </div>
        )}
      </section>

    </div>
  );
}