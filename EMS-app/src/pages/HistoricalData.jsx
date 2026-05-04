

import { useEffect, useState } from "react";
import { fetchAggregatedHistory, fetchComparison } from "../api/emsApi";

function HistoryChart({ data = [], color = "#4299e1", height = 280 }) {
  const W = 860, H = height, PX = 55, PY = 20;
  const values = data.map(d => d.value);

  if (values.length < 2) {
    return (
      <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
        No data for this period
      </div>
    );
  }

  const minV = Math.min(...values) * 0.97;
  const maxV = Math.max(...values) * 1.03 || 1;
  const rng  = maxV - minV || 1;

  const toX = (i) => PX + (i * (W - PX - 20)) / Math.max(values.length - 1, 1);
  const toY = (v) => PY + (1 - (v - minV) / rng) * (H - PY - 35);

  const points = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (rng * i) / 4;
    return { v: v.toFixed(1), y: toY(v) };
  });

  // Labels X (premier, milieu, dernier)
  const xLabels = [0, Math.floor(values.length / 2), values.length - 1]
    .filter(i => i < data.length)
    .map(i => ({
      x:     toX(i),
      label: data[i]?.timestamp ? new Date(data[i].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="hist-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {yLabels.map((l, i) => (
        <g key={i}>
          <line x1={PX} y1={l.y} x2={W - 20} y2={l.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
          <text x={PX - 5} y={l.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{l.v}</text>
        </g>
      ))}

      <polygon
        points={`${PX},${H - 35} ${points} ${toX(values.length - 1).toFixed(1)},${H - 35}`}
        fill="url(#hist-area)"
      />

      <polyline
        fill="none" stroke={color} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round"
        points={points}
      />

      {values.slice(-1).map((v, i) => (
        <circle key={i} cx={toX(values.length - 1)} cy={toY(v)} r="5" fill={color} stroke="white" strokeWidth="2" />
      ))}

      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={H - 12} textAnchor="middle" fontSize="10" fill="#94a3b8">{l.label}</text>
      ))}
    </svg>
  );
}

export default function HistoricalData({ selectedLineLabel = "Production Line 1" }) {
  const [period,     setPeriod]     = useState("day");
  const [energyType, setEnergyType] = useState("Electricity");
  const [histData,   setHistData]   = useState([]);
  const [stats,      setStats]      = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading,    setLoading]    = useState(false);

  const ENERGY_OPTIONS = [
    "Electricity",
    "Electricity-kWh",
    "CO2-Emissions",
  ];

  const PERIOD_OPTIONS = [
    { value: "hour",  label: "Last Hour"  },
    { value: "day",   label: "Last 24h"   },
    { value: "week",  label: "Last Week"  },
    { value: "month", label: "Last Month" },
    { value: "year",  label: "Last Year"  },
  ];

  // Charger historique agrégé
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchAggregatedHistory(selectedLineLabel, period, energyType);
        setHistData(data.data   || []);
        setStats(data.stats     || null);
      } catch (e) {
        console.error("History load error:", e);
        setHistData([]);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period, energyType, selectedLineLabel]);

  // Charger comparaison aujourd'hui vs hier
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchComparison(selectedLineLabel, energyType);
        setComparison(data);
      } catch {
        setComparison(null);
      }
    };
    load();
  }, [selectedLineLabel, energyType]);

  const variationColor = comparison?.variation_pct > 0
    ? "#e53e3e"
    : comparison?.variation_pct < 0
    ? "#38a169"
    : "#888";

  const variationIcon = comparison?.variation_pct > 5
    ? "↗"
    : comparison?.variation_pct < -5
    ? "↘"
    : "→";

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Historical Data</h1>
        <p>
          Energy consumption trends — {selectedLineLabel}
          <br />
        </p>
      </div>

      {/* Filtres */}
      <section className="section-block">
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600, margin: "0 0 0.5rem" }}>PERIOD</p>
            <div className="switch-tags">
              {PERIOD_OPTIONS.map(p => (
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
          </div>
          <div>
            <p style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600, margin: "0 0 0.5rem" }}>ENERGY TYPE</p>
            <div className="switch-tags">
              {ENERGY_OPTIONS.map(e => (
                <button
                  key={e}
                  type="button"
                  className={energyType === e ? "active" : ""}
                  onClick={() => setEnergyType(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats KPIs */}
      {stats && (
        <section className="section-block">
          <div className="carbon-kpis">
            <div className="carbon-card">
              <h4>Average</h4>
              <strong>{stats.avg}</strong>
              <span>{energyType}</span>
            </div>
            <div className="carbon-card">
              <h4>Minimum</h4>
              <strong>{stats.min}</strong>
              <span>Lowest in period</span>
            </div>
            <div className="carbon-card">
              <h4>Maximum</h4>
              <strong style={{ color: "#e53e3e" }}>{stats.max}</strong>
              <span>Peak in period</span>
            </div>
            <div className="carbon-card">
              <h4>Total Cost</h4>
              <strong>{stats.total_cost} $</strong>
              <span>0.14 $/kWh</span>
            </div>
            <div className="carbon-card">
              <h4>CO₂ Emitted</h4>
              <strong style={{ color: "#38a169" }}>{stats.total_co2} kg</strong>
              <span>kWh × 0.718 ONEE</span>
            </div>
            <div className="carbon-card">
              <h4>Data Points</h4>
              <strong>{stats.count}</strong>
              <span>Records in period</span>
            </div>
          </div>
        </section>
      )}

      {/* Graphe historique */}
      <section className="section-block">
        <div className="panel-card">
          <div className="panel-head">
            <div>
              <h2>{energyType} — {PERIOD_OPTIONS.find(p => p.value === period)?.label}</h2>
              <p>{selectedLineLabel} — {histData.length} data points</p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {loading && <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>Loading...</span>}
              {!loading && histData.length > 0 && (
                <span style={{ fontSize: "0.72rem", background: "#dcfce7", color: "#16a34a", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                  ● {histData.length} points
                </span>
              )}
            </div>
          </div>

          <HistoryChart data={histData} color="#4299e1" height={280} />
        </div>
      </section>

      {/* Comparaison aujourd'hui vs hier */}
      {comparison && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>Today vs Yesterday</h2>
            <p>
              Variation:{" "}
              <strong style={{ color: variationColor }}>
                {variationIcon} {comparison.variation_pct > 0 ? "+" : ""}{comparison.variation_pct}%
              </strong>
              {" "}— {comparison.trend}
            </p>
          </div>

          <div className="two-column-layout">
            <div className="panel-card">
              <div className="panel-head">
                <div><h2>Today (Last 24h)</h2><p>{comparison.today?.values?.length || 0} readings</p></div>
                <span style={{ fontSize: "0.72rem", background: "#ebf8ff", color: "#2b6cb0", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                  Today
                </span>
              </div>
              <div className="carbon-kpis" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <div className="carbon-card">
                  <h4>Average</h4>
                  <strong style={{ color: "#2b6cb0" }}>{comparison.today?.avg}</strong>
                  <span>{energyType}</span>
                </div>
                <div className="carbon-card">
                  <h4>Peak</h4>
                  <strong>{comparison.today?.max}</strong>
                  <span>Maximum today</span>
                </div>
                <div className="carbon-card">
                  <h4>Cost</h4>
                  <strong>{comparison.today?.total_cost} $</strong>
                  <span>Total today</span>
                </div>
              </div>
              <HistoryChart data={(comparison.today?.values || []).map((v, i) => ({ value: v, timestamp: comparison.today?.timestamps?.[i] }))} color="#4299e1" height={160} />
            </div>

            <div className="panel-card">
              <div className="panel-head">
                <div><h2>Yesterday</h2><p>{comparison.yesterday?.values?.length || 0} readings</p></div>
                <span style={{ fontSize: "0.72rem", background: "#f7fafc", color: "#718096", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                  Yesterday
                </span>
              </div>
              <div className="carbon-kpis" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <div className="carbon-card">
                  <h4>Average</h4>
                  <strong style={{ color: "#718096" }}>{comparison.yesterday?.avg}</strong>
                  <span>{energyType}</span>
                </div>
                <div className="carbon-card">
                  <h4>Peak</h4>
                  <strong>{comparison.yesterday?.max}</strong>
                  <span>Maximum yesterday</span>
                </div>
                <div className="carbon-card">
                  <h4>Cost</h4>
                  <strong>{comparison.yesterday?.total_cost} $</strong>
                  <span>Total yesterday</span>
                </div>
              </div>
              <HistoryChart data={(comparison.yesterday?.values || []).map((v, i) => ({ value: v, timestamp: comparison.yesterday?.timestamps?.[i] }))} color="#a0aec0" height={160} />
            </div>
          </div>
        </section>
      )}

      {/* Tableau détaillé */}
      {histData.length > 0 && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>Detailed Records</h2>
            <p>Last 20 records — {selectedLineLabel}</p>
          </div>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Value</th>
                  <th>Cost ($)</th>
                  <th>CO₂ (kg)</th>
                </tr>
              </thead>
              <tbody>
                {[...histData].reverse().slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: "0.82rem", color: "#64748b" }}>
                      {new Date(row.timestamp).toLocaleString()}
                    </td>
                    <td><strong>{row.value?.toFixed(2)}</strong></td>
                    <td>{row.cost?.toFixed(4)}</td>
                    <td>{row.co2_kg?.toFixed(3)}</td>
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