

import { useEffect, useState } from "react";
import {
  fetchIndustryAlarms,
  fetchIndustryKpis,
  resolveAlarm,
} from "../api/industryApi";
import { fetchAllLinesSummary } from "../api/emsApi";

// ─── Graphe barres comparaison ────────────────────────────────────────────────
function MultiLineBarChart({ lines, metric, unit, color = "#4299e1" }) {
  const values  = Object.entries(lines).map(([name, data]) => ({
    name,
    value: parseFloat(data[metric] || 0),
  }));
  const maxVal  = Math.max(...values.map(v => v.value), 1);
  const W = 600, H = 160;

  if (values.length === 0) return null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="none">
      {values.map((item, i) => {
        const barW  = (W - 40) / values.length - 8;
        const barH  = Math.max(4, (item.value / maxVal) * (H - 40));
        const x     = 20 + i * ((W - 40) / values.length);
        const y     = H - 25 - barH;
        return (
          <g key={item.name}>
            <rect x={x} y={y} width={barW} height={barH}
              fill={color} rx="4" opacity="0.85" />
            <text x={x + barW / 2} y={y - 4}
              textAnchor="middle" fontSize="9" fill="var(--text-main)" fontWeight="600">
              {item.value.toFixed(1)}
            </text>
            <text x={x + barW / 2} y={H - 8}
              textAnchor="middle" fontSize="9" fill="var(--text-secondary)">
              {item.name.replace("Production Line ", "L")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function IndustryOverview() {
  const [kpis,      setKpis]      = useState(null);
  const [alarms,    setAlarms]    = useState([]);
  const [linesSummary, setLinesSummary] = useState({});
  const [error,     setError]     = useState("");
  const [period,    setPeriod]    = useState("day");
  const [filterSev, setFilterSev] = useState("all");

  const loadData = async () => {
    try {
      const [kpiResult, alarmResult] = await Promise.all([
        fetchIndustryKpis(),
        fetchIndustryAlarms(),
      ]);
      setKpis(kpiResult);
      setAlarms(alarmResult || []);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load industry data");
    }
  };

  const loadLinesSummary = async () => {
    try {
      const data = await fetchAllLinesSummary(period);
      setLinesSummary(data.lines || {});
    } catch {}
  };

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    loadLinesSummary();
    const iv = setInterval(loadLinesSummary, 15000);
    return () => clearInterval(iv);
  }, [period]);

  const handleResolve = async (alarmId) => {
    try {
      await resolveAlarm(alarmId);
      loadData();
    } catch (err) {
      setError(err.message || "Failed to resolve alarm");
    }
  };

  // Statistiques alarmes
  const activeAlarms    = alarms.filter(a => a.status === "active");
  const highAlarms      = activeAlarms.filter(a => a.severity === "high");
  const mediumAlarms    = activeAlarms.filter(a => a.severity === "medium");
  const resolvedAlarms  = alarms.filter(a => a.status === "resolved");

  const filteredAlarms  = filterSev === "all"
    ? alarms
    : alarms.filter(a => a.severity === filterSev || a.status === filterSev);

  // Totaux toutes lignes
  const totalCostAll  = Object.values(linesSummary).reduce((s, l) => s + (l.total_cost  || 0), 0);
  const totalCo2All   = Object.values(linesSummary).reduce((s, l) => s + (l.total_co2   || 0), 0);
  const totalKwAll    = Object.values(linesSummary).reduce((s, l) => s + (l.stats_kw?.avg || 0), 0);

  const severityColors = {
    high:   { bg: "#fff5f5", border: "#fed7d7", text: "#c53030", badge: "#fc8181" },
    medium: { bg: "#fffbeb", border: "#fefcbf", text: "#b7791f", badge: "#f6e05e" },
    low:    { bg: "#f0fff4", border: "#c6f6d5", text: "#276749", badge: "#68d391" },
  };

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Industry Overview</h1>
          <p className="page-subtitle">
            Global KPIs — All production lines —  Plant 1
          </p>
        </div>
        <span className="live-label" style={{ fontSize: "0.9rem" }}>● Live </span>
      </div>

      {error && <div className="alarm-item">⚠ {error}</div>}

      {/* KPIs globaux */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Plant-Level KPIs</h2>
          <p>Aggregated from all production lines </p>
        </div>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">📊</div>
            <div className="kpi-badge red">Live</div>
            <h3>{kpis?.total_records ?? 0}</h3>
            <p>Total Records</p>
            <span>Telemetry processed</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon gold">$</div>
            <div className="kpi-badge red">Live</div>
            <h3>{(kpis?.total_cost ?? totalCostAll).toFixed(4)} $</h3>
            <p>Total Cost (all lines)</p>
            <span>0.14 $/kWh</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon orange">〰</div>
            <div className="kpi-badge amber">Live</div>
            <h3>{kpis?.peak_demand ?? 0} kW</h3>
            <p>Peak Demand</p>
            <span>Highest recorded</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon leaf">🌱</div>
            <div className="kpi-badge green">Live</div>
            <h3>{totalCo2All.toFixed(3)} kg</h3>
            <p>Total CO₂ (all lines)</p>
            <span>kWh × 0.718 ONEE</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon" style={{ background: "#fff5f5", color: "#e53e3e" }}>🔴</div>
            <div className="kpi-badge" style={{ background: highAlarms.length > 0 ? "#e53e3e" : "#38a169" }}>
              {highAlarms.length > 0 ? "Alert" : "OK"}
            </div>
            <h3 style={{ color: highAlarms.length > 0 ? "#e53e3e" : "#38a169" }}>
              {highAlarms.length}
            </h3>
            <p>High Severity Alarms</p>
            <span>Require immediate action</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon" style={{ background: "#fffbeb", color: "#d69e2e" }}>🟡</div>
            <div className="kpi-badge" style={{ background: mediumAlarms.length > 0 ? "#d69e2e" : "#38a169" }}>
              {mediumAlarms.length > 0 ? "Warning" : "OK"}
            </div>
            <h3 style={{ color: mediumAlarms.length > 0 ? "#d69e2e" : "#38a169" }}>
              {mediumAlarms.length}
            </h3>
            <p>Medium Severity Alarms</p>
            <span>Monitor closely</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon emerald">⚡</div>
            <div className="kpi-badge green">Live</div>
            <h3>{totalKwAll.toFixed(1)} kW</h3>
            <p>Total Active Power</p>
            <span>All lines combined</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon darkblue">✅</div>
            <div className="kpi-badge" style={{ background: "#38a169" }}>Live</div>
            <h3>{resolvedAlarms.length}</h3>
            <p>Resolved Alarms</p>
            <span>Total resolved</span>
          </div>
        </div>
      </section>

      {/* Comparaison multi-lignes */}
      <section className="section-block">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div className="section-title-wrap" style={{ margin: 0 }}>
            <h2>Multi-Line Comparison</h2>
            <p>Side-by-side performance of all production lines</p>
          </div>
          <div className="switch-tags">
            {["hour", "day", "week", "month"].map(p => (
              <button key={p} type="button"
                className={period === p ? "active" : ""}
                onClick={() => setPeriod(p)}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tableau comparaison */}
        {Object.keys(linesSummary).length > 0 ? (
          <>
            <div className="table-card" style={{ marginBottom: "1.25rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Production Line</th>
                    <th>Avg Power (kW)</th>
                    <th>Peak (kW)</th>
                    <th>Total kWh</th>
                    <th>Total Cost ($)</th>
                    <th>CO₂ (kg)</th>
                    <th>Records</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(linesSummary).map(([lineName, data]) => {
                    const avgKw = data.stats_kw?.avg || 0;
                    const maxKw = data.stats_kw?.max || 0;
                    const isActive = avgKw > 0;
                    return (
                      <tr key={lineName}>
                        <td><strong>{lineName}</strong></td>
                        <td>{avgKw.toFixed(1)}</td>
                        <td>{maxKw.toFixed(1)}</td>
                        <td>{(data.latest_kwh || 0).toFixed(2)}</td>
                        <td>{(data.total_cost || 0).toFixed(4)}</td>
                        <td style={{ color: "#38a169" }}>{(data.total_co2 || 0).toFixed(3)}</td>
                        <td>{data.record_count || 0}</td>
                        <td>
                          <span style={{
                            background: isActive ? "#f0fff4" : "#f7fafc",
                            color:      isActive ? "#38a169" : "#94a3b8",
                            border:     `1px solid ${isActive ? "#c6f6d5" : "#e2e8f0"}`,
                            borderRadius: "8px", padding: "2px 8px",
                            fontSize: "0.72rem", fontWeight: 700,
                          }}>
                            {isActive ? "● Active" : "○ Idle"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Graphes comparaison */}
            <div className="two-column-layout">
              <div className="panel-card">
                <div className="panel-head">
                  <div><h2>Power by Line</h2><p>Average kW — {period}</p></div>
                </div>
                <MultiLineBarChart
                  lines={linesSummary}
                  metric="avg_kw"
                  unit="kW"
                  color="#4299e1"
                />
              </div>
              <div className="panel-card">
                <div className="panel-head">
                  <div><h2>CO₂ by Line</h2><p>kg CO₂ — {period}</p></div>
                </div>
                <MultiLineBarChart
                  lines={linesSummary}
                  metric="total_co2"
                  unit="kg"
                  color="#38a169"
                />
              </div>
              <div className="panel-card">
                <div className="panel-head">
                  <div><h2>Cost by Line</h2><p>$ — {period}</p></div>
                </div>
                <MultiLineBarChart
                  lines={linesSummary}
                  metric="total_cost"
                  unit="$"
                  color="#d69e2e"
                />
              </div>
              <div className="panel-card">
                <div className="panel-head">
                  <div><h2>kWh by Line</h2><p>Cumulative — {period}</p></div>
                </div>
                <MultiLineBarChart
                  lines={linesSummary}
                  metric="latest_kwh"
                  unit="kWh"
                  color="#9f7aea"
                />
              </div>
            </div>
          </>
        ) : (
          <div style={{
            textAlign: "center", padding: "2rem",
            background: "var(--bg-card)", borderRadius: "12px",
            border: "1px solid var(--border-color)", color: "var(--text-secondary)",
          }}>
            Waiting for DataPlatform data...
          </div>
        )}
      </section>

      

      {/* Alarm Management */}
      <section className="section-block">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div className="section-title-wrap" style={{ margin: 0 }}>
            <h2>Alarm Management</h2>
            <p>
              {activeAlarms.length} active · {resolvedAlarms.length} resolved
              {highAlarms.length > 0 && (
                <span style={{ color: "#e53e3e", fontWeight: 700, marginLeft: "0.5rem" }}>
                  ⚠ {highAlarms.length} HIGH severity
                </span>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {["all", "high", "medium", "active", "resolved"].map(f => (
              <button key={f} type="button"
                onClick={() => setFilterSev(f)}
                style={{
                  padding:      "3px 10px",
                  borderRadius: "20px",
                  border:       "1px solid var(--border-color)",
                  cursor:       "pointer",
                  fontSize:     "0.75rem",
                  fontWeight:   filterSev === f ? 700 : 400,
                  background:   filterSev === f ? "#2563eb" : "var(--bg-card)",
                  color:        filterSev === f ? "#fff"    : "var(--text-main)",
                }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Line</th>
                <th>Equipment</th>
                <th>Message</th>
                <th>Value</th>
                <th>Limit</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlarms.length > 0 ? (
                filteredAlarms.slice(0, 50).map(alarm => {
                  const sc = severityColors[alarm.severity] || severityColors.medium;
                  return (
                    <tr key={alarm.id}>
                      <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {alarm.created_at
                          ? new Date(alarm.created_at).toLocaleTimeString()
                          : "—"}
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>
                        <strong>{alarm.alarm_type}</strong>
                      </td>
                      <td>
                        <span style={{
                          background:   sc.bg,
                          color:        sc.text,
                          border:       `1px solid ${sc.border}`,
                          borderRadius: "8px",
                          padding:      "2px 8px",
                          fontSize:     "0.72rem",
                          fontWeight:   700,
                          textTransform:"uppercase",
                        }}>
                          {alarm.severity}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>{alarm.production_line}</td>
                      <td style={{ fontSize: "0.8rem" }}><strong>{alarm.equipment}</strong></td>
                      <td style={{ fontSize: "0.78rem", color: "var(--text-secondary)", maxWidth: "200px" }}>
                        {alarm.message}
                      </td>
                      <td style={{ fontSize: "0.8rem", color: sc.text, fontWeight: 700 }}>
                        {alarm.measured_value ?? "—"}
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>{alarm.limit_value ?? "—"}</td>
                      <td>
                        <span style={{
                          background:   alarm.status === "active" ? "#fff5f5" : "#f0fff4",
                          color:        alarm.status === "active" ? "#e53e3e" : "#38a169",
                          borderRadius: "8px",
                          padding:      "2px 8px",
                          fontSize:     "0.72rem",
                          fontWeight:   700,
                        }}>
                          {alarm.status}
                        </span>
                      </td>
                      <td>
                        {alarm.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => handleResolve(alarm.id)}
                            style={{
                              background:   "#38a169",
                              color:        "#fff",
                              border:       "none",
                              borderRadius: "6px",
                              padding:      "3px 10px",
                              cursor:       "pointer",
                              fontSize:     "0.75rem",
                              fontWeight:   600,
                            }}
                          >
                            ✓ Resolve
                          </button>
                        ) : (
                          <span style={{ color: "#38a169", fontSize: "0.75rem" }}>✓ Done</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="10" style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
                    {filterSev === "all" ? "✅ No alarms found." : `No ${filterSev} alarms.`}
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