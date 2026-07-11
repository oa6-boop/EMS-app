import { useEffect, useState } from "react";
import { getCached, setCached } from "../utils/pageCache.js";
import TagFilter from "../components/TagFilter.jsx";
import { fetchIndustryAlarms, fetchIndustryKpis, resolveAlarm } from "../api/industryApi";
import { fetchAllLinesSummary, fetchStructure } from "../api/emsApi";
import { svgEventPoint, SvgHoverTooltip } from "../components/ChartTooltip.jsx";

const toMAD = (v) => `${Number(v || 0).toFixed(2)} MAD`;

const SEVERITY_COLORS = {
  high: { bg: "#fff5f5", border: "#fed7d7", text: "#c53030" },
  medium: { bg: "#fffbeb", border: "#fefcbf", text: "#b7791f" },
  low: { bg: "#f0fff4", border: "#c6f6d5", text: "#276749" },
};

function BarChart({ lines, metric, color = "#4299e1" }) {
  const [hover, setHover] = useState(null);
  const values = Object.entries(lines).map(([name, data]) => ({
    name,
    value: parseFloat(data[metric] || 0),
  }));

  const maxVal = Math.max(...values.map((v) => v.value), 1);
  const W = 600;
  const H = 160;

  if (values.length === 0) return null;

  // Étiquette au survol d'une barre : ligne + métrique + valeur exacte
  const slotW = (W - 40) / values.length;
  const handleMove = (evt) => {
    const { x } = svgEventPoint(evt, W, H);
    const i = Math.max(0, Math.min(values.length - 1, Math.floor((x - 20) / slotW)));
    const item = values[i];
    if (!item) return;
    const barH = Math.max(4, (item.value / maxVal) * (H - 40));
    setHover({
      x: 20 + i * slotW + (slotW - 8) / 2,
      y: H - 25 - barH,
      lines: [item.name, `${metric}: ${item.value.toFixed(3)}`],
    });
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: H }}
      preserveAspectRatio="none"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      {values.map((item, i) => {
        const barW = (W - 40) / values.length - 8;
        const barH = Math.max(4, (item.value / maxVal) * (H - 40));
        const x = 20 + i * ((W - 40) / values.length);
        const y = H - 25 - barH;

        return (
          <g key={item.name}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={color}
              rx="4"
              opacity={hover && hover.lines[0] === item.name ? 1 : 0.85}
            />

            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize="9"
              fill="var(--text-main)"
              fontWeight="600"
            >
              {item.value.toFixed(1)}
            </text>

            <text
              x={x + barW / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="9"
              fill="var(--text-secondary)"
            >
              {item.name.replace("Production Line ", "L")}
            </text>
          </g>
        );
      })}
      {hover && (
        <SvgHoverTooltip {...hover} W={W} H={H} color={color} guideTop={10} guideBottom={H - 25} />
      )}
    </svg>
  );
}

export default function IndustryOverview({
  totalCost = 0,
  totalCo2 = 0,
  peakKw = 0,
  cumulativeKwh = 0,
  backendSummary = {},
  availableTags = [],
  selectedTag = "",
  onTagSelect,
}) {
  const [kpis, setKpis] = useState(() => getCached("io_kpis", null));
  const [alarms, setAlarms] = useState(() => getCached("io_alarms", []));
  const [linesSummary, setLinesSummary] = useState(() => getCached("io_summary", {}));
  // Cache navigation : la page se rouvre avec ses dernieres donnees
  useEffect(() => { setCached("io_kpis", kpis); setCached("io_alarms", alarms); setCached("io_summary", linesSummary); }, [kpis, alarms, linesSummary]);
  const [structure, setStructure] = useState({
    lines: [],
    zones: [],
    plants: [],
    equipment: [],
  });
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("day");
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

  const loadStructure = async () => {
    try {
      const s = await fetchStructure();

      setStructure({
        lines: s.lines || [],
        zones: s.areas || [],
        plants: s.plants || [],
        equipment: s.equipment || [],
      });
    } catch {
      // ignore
    }
  };

  const loadLinesSummary = async () => {
    try {
      const data = await fetchAllLinesSummary(period);
      setLinesSummary(data.lines || {});
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadData();
    loadStructure();

    const intervalId = setInterval(loadData, 5000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    loadLinesSummary();

    const intervalId = setInterval(loadLinesSummary, 15000);

    return () => clearInterval(intervalId);
  }, [period]);

  const handleResolve = async (id) => {
    try {
      await resolveAlarm(id);
      loadData();
    } catch (err) {
      setError(err.message || "Failed to resolve alarm");
    }
  };

  const activeAlarms = alarms.filter((a) => a.status === "active");
  const highAlarms = activeAlarms.filter((a) => a.severity === "high");
  const mediumAlarms = activeAlarms.filter((a) => a.severity === "medium");
  const resolvedAlarms = alarms.filter((a) => a.status === "resolved");

  const filteredAlarms =
    filterSev === "all"
      ? alarms
      : alarms.filter((a) => a.severity === filterSev || a.status === filterSev);

  const backendLines = Object.values(backendSummary || {});

  const totalKwAll = backendLines.length
    ? backendLines.reduce(
        (sum, line) =>
          sum +
          (line.energies || [])
            .filter((e) => e.unit === "kW")
            .reduce((s, e) => s + Number(e.value || 0), 0),
        0
      )
    : Object.values(linesSummary).reduce(
        (s, l) => s + (l.avg_kw ?? l.stats_kw?.avg ?? 0),
        0
      );

  const totalCo2All =
    Number(totalCo2 || 0) ||
    Object.values(linesSummary).reduce((s, l) => s + (l.total_co2 || 0), 0);

  const totalCostAll =
    Number(totalCost || 0) ||
    Object.values(linesSummary).reduce((s, l) => s + (l.total_cost || 0), 0);

  const totalCumulKwh =
    Number(cumulativeKwh || 0) ||
    Object.values(linesSummary).reduce((s, l) => s + (l.cumulative_kwh || 0), 0);

  const totalCumulCost =
    totalCumulKwh > 0
      ? Number((totalCumulKwh * 1.4).toFixed(2))
      : Object.values(linesSummary).reduce((s, l) => s + (l.cumulative_cost || 0), 0);

  // Rollup d'agrégation (pas un équipement) : zone « Line Total » ou équipement
  // portant le nom de sa zone. Même règle que le backend / les autres pages.
  const isRollup = (e) => {
    const a = String(e.area || e.zone || "").trim().toLowerCase();
    const eq = String(e.equipment || "").trim().toLowerCase();
    return a === "line total" || (eq !== "" && eq === a);
  };
  const equipmentCount = backendLines.reduce((count, line) => {
    const set = new Set(
      (line.energies || []).filter((e) => e.equipment && !isRollup(e)).map((e) => e.equipment)
    );
    return count + set.size;
  }, 0);

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Industry Overview</h1>
          <p className="page-subtitle">
            Global KPIs — All production lines
            {structure.plants.length > 0 && ` — ${structure.plants.join(", ")}`}
          </p>
        </div>

        <span className="live-label" style={{ fontSize: "0.9rem" }}>
          ● Live
        </span>
      </div>

      <TagFilter
        availableTags={availableTags}
        selectedTag={selectedTag}
        onTagSelect={onTagSelect}
      />

      {error && <div className="alarm-item">⚠ {error}</div>}

      {(structure.plants.length > 0 ||
        structure.zones.length > 0 ||
        structure.lines.length > 0) && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>Discovered Infrastructure</h2>
          </div>

          <div className="carbon-kpis">
            {structure.plants.length > 0 && (
              <div className="carbon-card">
                <h4>🏭 Plants</h4>
                <strong>{structure.plants.length}</strong>

                {structure.plants.map((p) => (
                  <span
                    key={p}
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      color: "#2563eb",
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}

            {structure.zones.length > 0 && (
              <div className="carbon-card">
                <h4>📦 Zones</h4>
                <strong>{structure.zones.length}</strong>
                <span>Process zones on site</span>
              </div>
            )}

            {structure.lines.length > 0 && (
              <div className="carbon-card">
                <h4>🏗️ Production Lines</h4>
                <strong>{structure.lines.length}</strong>
                <span>Active production lines</span>
              </div>
            )}

            <div className="carbon-card">
              <h4>⚡ Active Meters</h4>
              <strong>{structure.equipment.length || equipmentCount || Object.keys(linesSummary).length}</strong>
            </div>
          </div>
        </section>
      )}

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Plant-Level KPIs</h2>
          <p>Aggregated from all production lines</p>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon gold">💰</div>
            <div className="kpi-badge red">Live</div>
            <h3>{toMAD(totalCostAll)}</h3>
            <p>Current Operating Cost</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon orange">〰</div>
            <div className="kpi-badge amber">Live</div>
            <h3>{Number(peakKw || kpis?.peak_demand || 0).toFixed(1)} kW</h3>
            <p>Peak Demand</p>
            <span>Highest recorded</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon leaf">🌱</div>
            <div className="kpi-badge green">Live</div>
            <h3>{totalCo2All.toFixed(3)} kg</h3>
            <p>Total CO₂ (all lines)</p>
            <span>Consumption × 0.718</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon emerald">⚡</div>
            <div className="kpi-badge green">Live</div>
            <h3>{totalKwAll.toFixed(1)} kW</h3>
            <p>Total Active Power</p>
            <span>All lines combined</span>
          </div>

          <div className="kpi-card">
            <div
              className="kpi-icon"
              style={{ background: "#fff5f5", color: "#e53e3e" }}
            >
              🔴
            </div>

            <div
              className="kpi-badge"
              style={{ background: highAlarms.length > 0 ? "#e53e3e" : "#38a169" }}
            >
              {highAlarms.length > 0 ? "Alert" : "OK"}
            </div>

            <h3 style={{ color: highAlarms.length > 0 ? "#e53e3e" : "#38a169" }}>
              {highAlarms.length}
            </h3>
            <p>High Severity Alarms</p>
          </div>

          <div className="kpi-card">
            <div
              className="kpi-icon"
              style={{ background: "#fffbeb", color: "#d69e2e" }}
            >
              🟡
            </div>

            <div
              className="kpi-badge"
              style={{
                background: mediumAlarms.length > 0 ? "#d69e2e" : "#38a169",
              }}
            >
              {mediumAlarms.length > 0 ? "Warning" : "OK"}
            </div>

            <h3 style={{ color: mediumAlarms.length > 0 ? "#d69e2e" : "#38a169" }}>
              {mediumAlarms.length}
            </h3>
            <p>Medium Severity Alarms</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon darkblue">✅</div>
            <div className="kpi-badge" style={{ background: "#38a169" }}>
              Live
            </div>
            <h3>{resolvedAlarms.length}</h3>
            <p>Resolved Alarms</p>
            <span>Total resolved</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon emerald">🔋</div>
            <div className="kpi-badge green">Live</div>
            <h3>{totalCumulKwh.toFixed(0)} kWh</h3>
            <p>Total Energy Consumed</p>
            <span>All lines cumulative</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon gold">💰</div>
            <div className="kpi-badge green">Live</div>
            <h3>{totalCumulCost.toFixed(2)} MAD</h3>
            <p>Cumulative Energy Cost</p>
            <span>All lines · 1.40 MAD/kWh</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <div className="section-title-wrap" style={{ margin: 0 }}>
            <h2>Multi-Line Comparison</h2>
            <p>Side-by-side performance of all production lines</p>
          </div>

          <div className="switch-tags">
            {["hour", "day", "week", "month"].map((p) => (
              <button
                key={p}
                type="button"
                className={period === p ? "active" : ""}
                onClick={() => setPeriod(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {Object.keys(linesSummary).length > 0 ? (
          <>
            <div className="table-card" style={{ marginBottom: "1.25rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Production Line</th>
                    <th>Plant</th>
                    <th>Zone</th>
                    <th>Avg Power (kW)</th>
                    <th>Peak (kW)</th>
                    <th>Consumption (kWh)</th>
                    <th>Total Cost (MAD)</th>
                    <th>CO₂ (kg)</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {Object.entries(linesSummary).map(([lineName, data]) => {
                    const avgKw = data.avg_kw ?? data.stats_kw?.avg ?? 0;
                    const maxKw = data.max_kw ?? data.stats_kw?.max ?? 0;
                    const consumption = data.consumption_kwh ?? 0;
                    const isActive = avgKw > 0;
                    const lineIdx = structure.lines.indexOf(lineName);
                    const zone = structure.zones[lineIdx] || "—";
                    const plant = structure.plants[0] || "Plant 1";

                    return (
                      <tr key={lineName}>
                        <td>
                          <strong>{lineName}</strong>
                        </td>
                        <td style={{ fontSize: "0.8rem", color: "#2563eb" }}>
                          {plant}
                        </td>
                        <td style={{ fontSize: "0.8rem", color: "#7c3aed" }}>
                          {zone}
                        </td>
                        <td>{avgKw.toFixed(1)}</td>
                        <td>{maxKw.toFixed(1)}</td>
                        <td>{consumption.toFixed(2)}</td>
                        <td style={{ color: "#d69e2e", fontWeight: 600 }}>
                          {toMAD(data.total_cost || 0)}
                        </td>
                        <td style={{ color: "#38a169" }}>
                          {(data.total_co2 || 0).toFixed(3)}
                        </td>
                        <td>
                          <span
                            style={{
                              background: isActive ? "#f0fff4" : "#f7fafc",
                              color: isActive ? "#38a169" : "#94a3b8",
                              border: `1px solid ${
                                isActive ? "#c6f6d5" : "#e2e8f0"
                              }`,
                              borderRadius: "8px",
                              padding: "2px 8px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                            }}
                          >
                            {isActive ? "● Active" : "○ Idle"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="two-column-layout">
              <div className="panel-card">
                <div className="panel-head">
                  <div>
                    <h2>Power by Line</h2>
                    <p>Average kW — {period}</p>
                  </div>
                </div>
                <BarChart lines={linesSummary} metric="avg_kw" color="#4299e1" />
              </div>

              <div className="panel-card">
                <div className="panel-head">
                  <div>
                    <h2>CO₂ by Line</h2>
                    <p>kg CO₂ — {period}</p>
                  </div>
                </div>
                <BarChart lines={linesSummary} metric="total_co2" color="#38a169" />
              </div>

              <div className="panel-card">
                <div className="panel-head">
                  <div>
                    <h2>Cost by Line</h2>
                    <p>MAD — {period}</p>
                  </div>
                </div>
                <BarChart lines={linesSummary} metric="total_cost" color="#d69e2e" />
              </div>

              <div className="panel-card">
                <div className="panel-head">
                  <div>
                    <h2>Consumption by Line</h2>
                    <p>kWh — {period}</p>
                  </div>
                </div>
                <BarChart
                  lines={linesSummary}
                  metric="consumption_kwh"
                  color="#9f7aea"
                />
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "2rem",
              background: "var(--bg-card)",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
            }}
          >
            ⏳ Waiting for DataPlatform data...
          </div>
        )}
      </section>

      <section className="section-block">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
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
            {["all", "high", "medium", "active", "resolved"].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterSev(f)}
                style={{
                  padding: "3px 10px",
                  borderRadius: "20px",
                  border: "1px solid var(--border-color)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: filterSev === f ? 700 : 400,
                  background: filterSev === f ? "#2563eb" : "var(--bg-card)",
                  color: filterSev === f ? "#fff" : "var(--text-main)",
                }}
              >
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
                <th>Plant</th>
                <th>Zone</th>
                <th>Line</th>
                <th>Equipment</th>
                <th>Message</th>
                <th>Value</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredAlarms.length > 0 ? (
                filteredAlarms.slice(0, 50).map((alarm) => {
                  const sc = SEVERITY_COLORS[alarm.severity] || SEVERITY_COLORS.medium;

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
                        <span
                          style={{
                            background: sc.bg,
                            color: sc.text,
                            border: `1px solid ${sc.border}`,
                            borderRadius: "8px",
                            padding: "2px 8px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}
                        >
                          {alarm.severity}
                        </span>
                      </td>

                      <td style={{ fontSize: "0.8rem", color: "#2563eb" }}>
                        {alarm.plant || "Plant 1"}
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#7c3aed" }}>
                        {alarm.area || "—"}
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {alarm.production_line || "—"}
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>
                        <strong>{alarm.equipment || "—"}</strong>
                      </td>
                      <td
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--text-secondary)",
                          maxWidth: "200px",
                        }}
                      >
                        {alarm.message}
                      </td>
                      <td style={{ fontSize: "0.8rem", color: sc.text, fontWeight: 700 }}>
                        {alarm.measured_value != null
                          ? Number(alarm.measured_value).toFixed(2)
                          : "—"}
                      </td>
                      <td>
                        <span
                          style={{
                            background:
                              alarm.status === "active" ? "#fff5f5" : "#f0fff4",
                            color:
                              alarm.status === "active" ? "#e53e3e" : "#38a169",
                            borderRadius: "8px",
                            padding: "2px 8px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                          }}
                        >
                          {alarm.status}
                        </span>
                      </td>
                      <td>
                        {alarm.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => handleResolve(alarm.id)}
                            style={{
                              background: "#38a169",
                              color: "#fff",
                              border: "none",
                              borderRadius: "6px",
                              padding: "3px 10px",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                            }}
                          >
                            ✓ Resolve
                          </button>
                        ) : (
                          <span style={{ color: "#38a169", fontSize: "0.75rem" }}>
                            ✓ Done
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="11"
                    style={{
                      textAlign: "center",
                      color: "var(--text-secondary)",
                      padding: "2rem",
                    }}
                  >
                    {filterSev === "all"
                      ? "✅ No alarms. All parameters within range."
                      : `No ${filterSev} alarms.`}
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