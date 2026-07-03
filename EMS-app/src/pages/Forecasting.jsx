import { useMemo, useState } from "react";
import { aggregateByEnergy } from "../utils/energyAggregation.js";
import { svgEventPoint, nearestIndex, SvgHoverTooltip } from "../components/ChartTooltip.jsx";

function ForecastChart({ historical = [], predictions = [], unit = "", color = "#4299e1" }) {
  const W = 760, H = 260, PX = 45, PY = 20;
  const [hover, setHover] = useState(null);
  const allVals = [...historical, ...predictions].filter((v) => v != null);
  if (allVals.length < 2) {
    return (
      <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
        {historical.length === 0 ? "Waiting for DataPlatform data..." : "Collecting data points..."}
      </div>
    );
  }
  const minV = Math.min(...allVals) * 0.97;
  const maxV = Math.max(...allVals) * 1.03 || 1;
  const rng  = maxV - minV || 1;
  const totalPoints = historical.length + predictions.length;
  const toX = (i) => PX + (i * (W - PX - 10)) / Math.max(totalPoints - 1, 1);
  const toY = (v) => PY + (1 - (v - minV) / rng) * (H - PY - 25);
  const histPoints = historical.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const predOffset = historical.length;
  const predPoints = predictions.length > 0 ? [
    `${toX(predOffset - 1).toFixed(1)},${toY(historical[historical.length - 1] || 0).toFixed(1)}`,
    ...predictions.map((v, i) => `${toX(predOffset + i).toFixed(1)},${toY(v).toFixed(1)}`),
  ].join(" ") : "";
  const sepX = toX(predOffset - 1);
  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (rng * i) / 4;
    return { v: v.toFixed(unit === "" ? 3 : 1), y: toY(v) };
  });

  // Étiquette au survol : distingue Historical / Forecast + valeur du point
  const series = [...historical, ...predictions];
  const handleMove = (evt) => {
    if (series.length < 2) return;
    const { x } = svgEventPoint(evt, W, H);
    const i = nearestIndex(x, PX, W - PX - 10, series.length);
    const v = series[i];
    if (v == null) return;
    const isForecast = i >= historical.length;
    setHover({
      x: toX(i),
      y: toY(v),
      lines: [
        isForecast ? `Forecast +${i - historical.length + 1}` : `Historical · point ${i + 1}`,
        `${Number(v).toFixed(2)} ${unit}`,
      ],
    });
  };

  return (
    <div>
      <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "0.5rem", display: "flex", gap: "1.5rem" }}>
        <span style={{ color }}>—— Historical</span>
        <span style={{ color, opacity: 0.6 }}>- - - Forecast</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="none"
        onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`fgrad-${unit}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PX} y1={l.y} x2={W - 10} y2={l.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
            <text x={PX - 5} y={l.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{l.v}</text>
          </g>
        ))}
        <line x1={sepX} y1={PY} x2={sepX} y2={H - 25} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,3" />
        <text x={sepX} y={H - 10} textAnchor="middle" fontSize="9" fill="#94a3b8">now</text>
        {historical.length > 0 && (
          <polygon points={`${PX},${H - 25} ${histPoints} ${toX(historical.length - 1).toFixed(1)},${H - 25}`} fill={`url(#fgrad-${unit})`} />
        )}
        {historical.length > 1 && (
          <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" points={histPoints} />
        )}
        {predPoints && (
          <polyline fill="none" stroke={color} strokeWidth="2" strokeDasharray="7,4" strokeLinejoin="round" points={predPoints} opacity="0.7" />
        )}
        {historical.slice(-5).map((v, i) => {
          const idx = historical.length - 5 + i;
          return <circle key={i} cx={toX(idx)} cy={toY(v)} r="3.5" fill={color} stroke="white" strokeWidth="1.5"><title>{`Historical — Point ${idx + 1}: ${Number(v).toFixed(2)} ${unit}`}</title></circle>;
        })}
        {predictions.map((v, i) => (
          <circle key={i} cx={toX(predOffset + i)} cy={toY(v)} r="3" fill={color} stroke="white" strokeWidth="1.5" opacity="0.7">
            <title>{`Forecast +${i + 1} — ${Number(v).toFixed(2)} ${unit}`}</title>
          </circle>
        ))}
        <text x={W - 10} y={H - 10} fontSize="9" fill={color} textAnchor="end" opacity="0.7">
          +{predictions.length} forecast
        </text>
        {hover && (
          <SvgHoverTooltip {...hover} W={W} H={H} color={color} guideTop={PY} guideBottom={H - 25} />
        )}
      </svg>
    </div>
  );
}

export default function Forecasting({ energies = [], selectedLineLabel = "Production Line 1" }) {
  const [view, setView] = useState("daily");

  const fallbackForecast = useMemo(() => {
    const inc  = view === "daily" ? 1.05 : view === "weekly" ? 1.08 : 1.12;
    const base = energies.slice(0, 3).map((e) => e.value || 0);
    const avg  = base.length ? base.reduce((s, v) => s + v, 0) / base.length : 100;
    return Array.from({ length: 12 }, (_, i) =>
      parseFloat((avg * Math.pow(inc, i * 0.1) + ((i % 3) - 1) * avg * 0.03).toFixed(2))
    );
  }, [energies, view]);

  const labels = {
    daily:   ["00h","02h","04h","06h","08h","10h","12h","14h","16h","18h","20h","22h"],
    weekly:  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun","M2","T2","W2","T2","F2"],
    monthly: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  }[view];

  const electricEnergies = energies.filter((e) => e.unit === "kW");
  const totalKw          = electricEnergies.reduce((s, e) => s + e.value, 0);
  const kwhE             = energies.find((e) => e.unit === "kWh");

  // Résumé par énergie : UNE carte par énergie (agrégée sur les équipements)
  const energySummary = aggregateByEnergy(energies);

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Forecasting</h1>
        <p>Predicted energy demand — {selectedLineLabel}</p>
      </div>

      {/* KPIs actuels */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Current vs Forecast</h2>
        </div>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">⚡</div>
            <div className="kpi-badge red">Live</div>
            <h3>{totalKw > 0 ? `${totalKw.toFixed(1)} kW` : "—"}</h3>
            <p>Current Total Power</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon" style={{ color: "#ed8936" }}>📈</div>
            <div className="kpi-badge" style={{ background: "#ed8936" }}>Forecast</div>
            <h3 style={{ color: "#ed8936" }}>
              {totalKw > 0
                ? `${(totalKw * (view === "daily" ? 1.05 : view === "weekly" ? 1.08 : 1.12)).toFixed(1)} kW`
                : "—"}
            </h3>
            <p>Next Power Forecast</p>
          </div>

          {kwhE && (
            <div className="kpi-card">
              <div className="kpi-icon emerald">🔋</div>
              <div className="kpi-badge green">Live</div>
              <h3>{kwhE.value.toFixed(1)} kWh</h3>
              <p>Cumulative Energy</p>
            </div>
          )}

          {totalKw > 0 && (
            <div className="kpi-card">
              <div className="kpi-icon leaf" style={{ color: "#38a169" }}>🌱</div>
              <div className="kpi-badge" style={{ background: "#38a169" }}>Forecast</div>
              <h3 style={{ color: "#38a169" }}>
                {(totalKw * (view === "daily" ? 1.05 : 1.08) * 0.718 / 1000).toFixed(4)} tCO₂e/h
              </h3>
              <p>Forecast CO₂ Rate</p>
              <span>kW × 0.718 / 1000</span>
            </div>
          )}
        </div>
      </section>

      {/* Graphe */}
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <h2>Load Forecasting</h2>
            <p>Trend-based local forecast</p>
          </div>
          <div className="switch-tags">
            {["daily", "weekly", "monthly"].map((v) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => setView(v)}
                type="button"
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <ForecastChart
          historical={fallbackForecast.slice(0, 8)}
          predictions={fallbackForecast.slice(8)}
          unit="kW"
          color="#4299e1"
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.8rem", color: "#94a3b8" }}>
          {labels.slice(0, 6).map((l, i) => <span key={i}>{l}</span>)}
        </div>
      </section>

      {/* Résumé par énergie */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Forecast Summary by Energy Type</h2>
          <p>{view} view</p>
        </div>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {energySummary.length > 0 ? (
            energySummary.map((energy) => (
              <div className="kpi-card" key={`${energy.name}-${energy.unit}`}>
                <div className="kpi-icon blue">📈</div>
                <h3>
                  {(energy.value * (view === "daily" ? 1.05 : view === "weekly" ? 1.08 : 1.12)).toFixed(2)} {energy.unit}
                </h3>
                <p>Forecast {energy.name}</p>
                <span>Current: {energy.value.toFixed(2)} {energy.unit}</span>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#888" }}>
              No energy data — DataPlatform not connected.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}