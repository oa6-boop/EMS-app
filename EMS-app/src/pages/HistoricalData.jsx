import { useEffect, useState } from "react";
import { fetchAggregatedHistory, fetchComparison, fetchStructure } from "../api/emsApi";
import TagFilter from "../components/TagFilter.jsx";
import { svgEventPoint, nearestIndex, SvgHoverTooltip } from "../components/ChartTooltip.jsx";

const toMAD = (mad) => `${Number(mad || 0).toFixed(2)} MAD`;
const DEFAULT_ENERGY_TYPE = "Electricity";

function HistoryChart({ data = [], color = "#4299e1", height = 280 }) {
  const W = 860;
  const H = height;
  const PX = 55;
  const PY = 20;
  const [hover, setHover] = useState(null);

  const values = data.map((d) => Number(d.value || 0));

  if (values.length < 2) {
    return (
      <div
        style={{
          height: H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94a3b8",
          fontSize: "0.85rem",
        }}
      >
        No data for this period — data accumulates in real time from DataPlatform
      </div>
    );
  }

  const minV = Math.min(...values) * 0.97;
  const maxV = Math.max(...values) * 1.03 || 1;
  const rng = maxV - minV || 1;

  const toX = (i) =>
    PX + (i * (W - PX - 20)) / Math.max(values.length - 1, 1);

  const toY = (v) =>
    PY + (1 - (v - minV) / rng) * (H - PY - 35);

  const points = values
    .map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(" ");

  const xLabels = [0, Math.floor(values.length / 2), values.length - 1]
    .filter((i) => i < data.length)
    .map((i) => ({
      x: toX(i),
      label: data[i]?.timestamp
        ? new Date(data[i].timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    }));

  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (rng * i) / 4;
    return {
      v: v.toFixed(1),
      y: toY(v),
    };
  });

  // Étiquette au survol : date/heure + valeur + unité + coût du point
  const handleMove = (evt) => {
    const { x } = svgEventPoint(evt, W, H);
    const i = nearestIndex(x, PX, W - PX - 20, values.length);
    const d = data[i] || {};
    const lines = [
      d.timestamp
        ? new Date(d.timestamp).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : `Point ${i + 1}`,
      `${Number(values[i]).toFixed(3)} ${d.unit || ""}`.trim(),
    ];
    if (d.cost != null && Number(d.cost) > 0) lines.push(`${Number(d.cost).toFixed(2)} MAD`);
    setHover({ x: toX(i), y: toY(values[i]), lines });
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: H }}
      preserveAspectRatio="none"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id="hist-electricity" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {yLabels.map((l, i) => (
        <g key={i}>
          <line
            x1={PX}
            y1={l.y}
            x2={W - 20}
            y2={l.y}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          <text
            x={PX - 5}
            y={l.y + 4}
            textAnchor="end"
            fontSize="10"
            fill="#94a3b8"
          >
            {l.v}
          </text>
        </g>
      ))}

      <polygon
        points={`${PX},${H - 35} ${points} ${toX(values.length - 1).toFixed(
          1
        )},${H - 35}`}
        fill="url(#hist-electricity)"
      />

      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />

      {values.map((v, i) => (
        <circle key={`hover-${i}`} cx={toX(i)} cy={toY(v)} r="7" fill="transparent">
          <title>{`${data[i]?.energy_name || "Value"} — ${Number(v).toFixed(3)} ${data[i]?.unit || ""} · ${data[i]?.timestamp ? new Date(data[i].timestamp).toLocaleString() : ""}`}</title>
        </circle>
      ))}

      <circle
        cx={toX(values.length - 1)}
        cy={toY(values[values.length - 1])}
        r="5"
        fill={color}
        stroke="white"
        strokeWidth="2"
      >
        <title>{`${data[values.length - 1]?.energy_name || "Latest"} — ${Number(values[values.length - 1]).toFixed(3)} ${data[values.length - 1]?.unit || ""}`}</title>
      </circle>

      {xLabels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={H - 12}
          textAnchor="middle"
          fontSize="10"
          fill="#94a3b8"
        >
          {l.label}
        </text>
      ))}
      {hover && (
        <SvgHoverTooltip {...hover} W={W} H={H} color={color} guideTop={PY} guideBottom={H - 35} />
      )}
    </svg>
  );
}

export default function HistoricalData({
  selectedLineLabel = "Production Line 1",
  selectedPlant = "all",
  selectedZone = "all",
  selectedEquipment = "all",
  availableTags = [],
  selectedTag = "",
  onTagSelect,
}) {
  const [period, setPeriod] = useState("day");
  const [energyType, setEnergyType] = useState(DEFAULT_ENERGY_TYPE);
  const [energyTypes, setEnergyTypes] = useState([DEFAULT_ENERGY_TYPE]);
  const [histData, setHistData] = useState([]);
  const [stats, setStats] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const PERIOD_OPTIONS = [
    { value: "hour", label: "Last Hour" },
    { value: "day", label: "Last 24h" },
    { value: "week", label: "Last Week" },
    { value: "month", label: "Last Month" },
    { value: "year", label: "Last Year" },
  ];

  useEffect(() => {
    const loadStructure = async () => {
      try {
        const structure = await fetchStructure();
        const types = structure?.energy_types?.length ? structure.energy_types : [DEFAULT_ENERGY_TYPE];
        setEnergyTypes(types);
        if (!types.includes(energyType)) setEnergyType(types.includes(DEFAULT_ENERGY_TYPE) ? DEFAULT_ENERGY_TYPE : types[0]);
      } catch {
        setEnergyTypes([DEFAULT_ENERGY_TYPE]);
      }
    };
    loadStructure();
  }, [energyType]);

  const backendFilters = {
    plant: selectedPlant !== "all" ? selectedPlant : "",
    zone: selectedZone !== "all" ? selectedZone : "",
    equipment: selectedEquipment !== "all" ? selectedEquipment : "",
    tag: selectedTag || "",
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const data = await fetchAggregatedHistory(
          selectedLineLabel,
          period,
          energyType,
          backendFilters
        );

        setHistData(data.data || []);
        setStats(data.stats || null);
      } catch {
        setError("Cannot load history — check that the backend is running.");
        setHistData([]);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [period, selectedLineLabel, energyType, selectedPlant, selectedZone, selectedEquipment, selectedTag]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchComparison(selectedLineLabel, energyType, backendFilters);
        setComparison(data);
      } catch {
        setComparison(null);
      }
    };

    load();
  }, [selectedLineLabel, energyType, selectedPlant, selectedZone, selectedEquipment, selectedTag]);

  const variationColor =
    comparison?.variation_pct > 0
      ? "#e53e3e"
      : comparison?.variation_pct < 0
      ? "#38a169"
      : "#888";

  const variationIcon =
    comparison?.variation_pct > 5
      ? "↗"
      : comparison?.variation_pct < -5
      ? "↘"
      : "→";

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Historical Data</h1>
        <p>
          {energyType} trends — {selectedLineLabel} · Costs in MAD
          {selectedTag ? ` — #${selectedTag}` : ""}
        </p>
      </div>

      <TagFilter
        availableTags={availableTags}
        selectedTag={selectedTag}
        onTagSelect={onTagSelect}
      />

      {error && (
        <div className="alarm-item" style={{ marginBottom: "1rem" }}>
          ⚠ {error}
        </div>
      )}

      <section className="section-block">
        <p
          style={{
            fontSize: "0.82rem",
            color: "#64748b",
            fontWeight: 600,
            margin: "0 0 0.5rem",
          }}
        >
          PERIOD
        </p>

        <div className="switch-tags" style={{ marginBottom: "0.75rem" }}>
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={period === p.value ? "active" : ""}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600, margin: "0.75rem 0 0.5rem" }}>
          ENERGY / KPI
        </p>
        <div className="switch-tags">
          {energyTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={energyType === type ? "active" : ""}
              onClick={() => setEnergyType(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </section>

      {stats && Object.keys(stats).length > 0 && (
        <section className="section-block">
          <div className="carbon-kpis">
            <div className="carbon-card">
              <h4>Average</h4>
              <strong>{stats.avg} {histData[0]?.unit || ""}</strong>
              <span>Average active power</span>
            </div>

            <div className="carbon-card">
              <h4>Minimum</h4>
              <strong>{stats.min} {histData[0]?.unit || ""}</strong>
              <span>Lowest in period</span>
            </div>

            <div className="carbon-card">
              <h4>Maximum</h4>
              <strong style={{ color: "#e53e3e" }}>{stats.max} {histData[0]?.unit || ""}</strong>
              <span>Peak in period</span>
            </div>

            <div className="carbon-card">
              <h4>Estimated Cost</h4>
              <strong style={{ color: "#d69e2e" }}>
                {toMAD(stats.total_cost)}
              </strong>
              <span>Based on selected KPI records</span>
            </div>

            <div className="carbon-card">
              <h4>Data Points</h4>
              <strong>{stats.count}</strong>
              <span>Records in period</span>
            </div>
          </div>
        </section>
      )}

      <section className="section-block">
        <div className="panel-card">
          <div className="panel-head">
            <div>
              <h2>
                {energyType} —{" "}
                {PERIOD_OPTIONS.find((p) => p.value === period)?.label}
              </h2>
              <p>
                {selectedLineLabel} — {histData.length} data points
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {loading && (
                <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                  Loading...
                </span>
              )}

              {!loading && histData.length > 0 && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    background: "#dcfce7",
                    color: "#16a34a",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    fontWeight: 600,
                  }}
                >
                  ● {histData.length} points
                </span>
              )}
            </div>
          </div>

          {!loading && histData.length === 0 && !error && (
            <div className="info-box">
              ℹ️ No {energyType} data yet on{" "}
              <strong>{selectedLineLabel}</strong>. Data accumulates
              automatically from the DataPlatform.
            </div>
          )}

          <HistoryChart data={histData} color="#4299e1" height={280} />
        </div>
      </section>

      {comparison && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>Today vs Yesterday</h2>
            <p>
              Variation:{" "}
              <strong style={{ color: variationColor }}>
                {variationIcon} {comparison.variation_pct > 0 ? "+" : ""}
                {comparison.variation_pct}%
              </strong>{" "}
              — {comparison.trend}
            </p>
          </div>

          <div className="two-column-layout">
            <div className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Today (Last 24h)</h2>
                  <p>{comparison.today?.values?.length || 0} readings</p>
                </div>
              </div>

              <div
                className="carbon-kpis"
                style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
              >
                <div className="carbon-card">
                  <h4>Average</h4>
                  <strong>{comparison.today?.avg} kW</strong>
                </div>

                <div className="carbon-card">
                  <h4>Peak</h4>
                  <strong>{comparison.today?.max} kW</strong>
                </div>

                <div className="carbon-card">
                  <h4>Cost</h4>
                  <strong style={{ color: "#d69e2e" }}>
                    {toMAD(comparison.today?.total_cost)}
                  </strong>
                </div>
              </div>

              <HistoryChart
                data={(comparison.today?.values || []).map((v, i) => ({
                  value: v,
                  timestamp: comparison.today?.timestamps?.[i],
                }))}
                color="#4299e1"
                height={160}
              />
            </div>

            <div className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Yesterday</h2>
                  <p>{comparison.yesterday?.values?.length || 0} readings</p>
                </div>
              </div>

              <div
                className="carbon-kpis"
                style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
              >
                <div className="carbon-card">
                  <h4>Average</h4>
                  <strong>{comparison.yesterday?.avg} kW</strong>
                </div>

                <div className="carbon-card">
                  <h4>Peak</h4>
                  <strong>{comparison.yesterday?.max} kW</strong>
                </div>

                <div className="carbon-card">
                  <h4>Cost</h4>
                  <strong style={{ color: "#d69e2e" }}>
                    {toMAD(comparison.yesterday?.total_cost)}
                  </strong>
                </div>
              </div>

              <HistoryChart
                data={(comparison.yesterday?.values || []).map((v, i) => ({
                  value: v,
                  timestamp: comparison.yesterday?.timestamps?.[i],
                }))}
                color="#a0aec0"
                height={160}
              />
            </div>
          </div>
        </section>
      )}

      {histData.length > 0 && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>Detailed Records</h2>
            <p>Last 20 {energyType} records — {selectedLineLabel}</p>
          </div>

          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Value</th>
                  <th>Cost (MAD)</th>
                </tr>
              </thead>

              <tbody>
                {[...histData]
                  .reverse()
                  .slice(0, 20)
                  .map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: "0.82rem", color: "#64748b" }}>
                        {new Date(row.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <strong>{Number(row.value || 0).toFixed(2)} {row.unit || ""}</strong>
                      </td>
                      <td style={{ color: "#d69e2e", fontWeight: 600 }}>
                        {toMAD(row.cost)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}