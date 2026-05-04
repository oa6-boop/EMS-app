import { useEffect, useMemo, useState } from "react";
import { fetchPredictions } from "../api/emsApi";

function ForecastChart({ historical = [], predictions = [], ciLow = [], ciHigh = [], unit = "", color = "#4299e1" }) {
  const W = 760, H = 260, PX = 45, PY = 20;
  const allVals = [...historical, ...predictions, ...ciLow, ...ciHigh].filter((v) => v != null);
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
  const ciPolygon = ciLow.length > 0 && ciHigh.length > 0 ? [
    ...ciHigh.map((v, i) => `${toX(predOffset + i).toFixed(1)},${toY(v).toFixed(1)}`),
    ...[...ciLow].reverse().map((v, i) => `${toX(predOffset + ciLow.length - 1 - i).toFixed(1)},${toY(v).toFixed(1)}`),
  ].join(" ") : "";
  const sepX  = toX(predOffset - 1);
  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (rng * i) / 4;
    return { v: v.toFixed(unit === "" ? 3 : 1), y: toY(v) };
  });
  return (
    <div>
      <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "0.5rem", display: "flex", gap: "1.5rem" }}>
        <span style={{ color }}>—— Historical</span>
        <span style={{ color, opacity: 0.6 }}>- - - Prediction</span>
        {ciLow.length > 0 && <span style={{ color: "#a0aec0" }}>░ Confidence interval (95%)</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fgrad-${unit}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PX} y1={l.y} x2={W-10} y2={l.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
            <text x={PX - 5} y={l.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{l.v}</text>
          </g>
        ))}
        {ciPolygon && <polygon points={ciPolygon} fill={color} opacity="0.12" />}
        <line x1={sepX} y1={PY} x2={sepX} y2={H - 25} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,3" />
        <text x={sepX} y={H - 10} textAnchor="middle" fontSize="9" fill="#94a3b8">now</text>
        {historical.length > 0 && (
          <polygon points={`${PX},${H-25} ${histPoints} ${toX(historical.length - 1).toFixed(1)},${H-25}`} fill={`url(#fgrad-${unit})`} />
        )}
        {historical.length > 1 && <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" points={histPoints} />}
        {predPoints && <polyline fill="none" stroke={color} strokeWidth="2" strokeDasharray="7,4" strokeLinejoin="round" points={predPoints} opacity="0.7" />}
        {historical.slice(-5).map((v, i) => {
          const idx = historical.length - 5 + i;
          return <circle key={i} cx={toX(idx)} cy={toY(v)} r="3.5" fill={color} stroke="white" strokeWidth="1.5" />;
        })}
        {predictions.map((v, i) => (
          <circle key={i} cx={toX(predOffset + i)} cy={toY(v)} r="3" fill={color} stroke="white" strokeWidth="1.5" opacity="0.7" />
        ))}
        <text x={W - 10} y={H - 10} fontSize="9" fill={color} textAnchor="end" opacity="0.7">+{predictions.length} pred.</text>
      </svg>
    </div>
  );
}

export default function Forecasting({ energies = [], selectedLineLabel = "Production Line 1" }) {
  const [view,        setView]        = useState("daily");
  const [predData,    setPredData]    = useState(null);
  const [loadingPred, setLoadingPred] = useState(true);
  const [errorPred,   setErrorPred]   = useState("");

  useEffect(() => {
    const load = async () => {
      setLoadingPred(true);
      try {
        const data = await fetchPredictions(selectedLineLabel, 10);
        setPredData(data);
        setErrorPred("");
      } catch {
        setErrorPred("Backend predictions unavailable — using local forecast");
        setPredData(null);
      } finally { setLoadingPred(false); }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [selectedLineLabel]);

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

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Forecasting</h1>
        <p>
          Predicted energy demand — {selectedLineLabel}
          <br />
          
        </p>
      </div>

      {/* KPIs actuels vs prédits */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Current vs Predicted</h2>
          <p>{loadingPred ? "Loading Python predictions..." : predData ? `Confidence: V=${predData.voltage?.confidence}% · PF=${predData.power_factor?.confidence}% · kW=${predData.active_power?.confidence}%` : "Using local forecast"}</p>
        </div>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">⚡</div><div className="kpi-badge red">Live</div>
            <h3>{totalKw > 0 ? `${totalKw.toFixed(1)} kW` : "—"}</h3>
            <p>Current Total Power</p>
          </div>
          {["active_power","voltage","power_factor"].map((key) => {
            const meta = { active_power: { label: "Next Power Forecast", unit: "kW", color: "#ed8936" }, voltage: { label: "Next Voltage Forecast", unit: "V", color: "#4299e1" }, power_factor: { label: "Next Power Factor", unit: "", color: "#9f7aea" } }[key];
            const p    = predData?.[key];
            const val  = p?.predictions?.[0];
            const trendColor = { increasing: "#e53e3e", decreasing: "#38a169", stable: "#888" }[p?.stats?.trend] || "#888";
            return (
              <div className="kpi-card" key={key}>
                <div className="kpi-icon" style={{ color: meta.color }}>📈</div>
                <div className="kpi-badge" style={{ background: meta.color }}>Forecast</div>
                <h3 style={{ color: meta.color }}>{val != null ? `${Number(val).toFixed(meta.unit === "" ? 3 : 1)} ${meta.unit}` : "—"}</h3>
                <p>{meta.label}</p>
                <span><span style={{ color: trendColor }}>{p?.stats?.trend || "—"}</span>{p?.confidence != null && ` · ${p.confidence}%`}</span>
              </div>
            );
          })}
          {kwhE && (
            <div className="kpi-card">
              <div className="kpi-icon emerald">🔋</div><div className="kpi-badge green">Live</div>
              <h3>{kwhE.value.toFixed(1)} kWh</h3><p>Cumulative Energy</p>
            </div>
          )}
          {predData?.active_power?.predictions?.[0] && (
            <div className="kpi-card">
              <div className="kpi-icon leaf" style={{ color: "#38a169" }}>🌱</div>
              <div className="kpi-badge" style={{ background: "#38a169" }}>Forecast</div>
              <h3 style={{ color: "#38a169" }}>{(predData.active_power.predictions[0] * 0.718 / 1000).toFixed(4)} tCO₂e/h</h3>
              <p>Predicted CO₂ Rate</p><span>kW × 0.718 / 1000</span>
            </div>
          )}
        </div>
      </section>

      {/* Graphes */}
      <div className="two-column-layout">
        <section className="panel-card">
          <div className="panel-head">
            <div><h2>Load Forecasting</h2><p>{predData ? `Python · Confidence: ${predData.active_power?.confidence || "—"}%` : "Local forecast"}</p></div>
            <div className="switch-tags">
              {["daily","weekly","monthly"].map((v) => (
                <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)} type="button">
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <ForecastChart historical={fallbackForecast.slice(0, 8)} predictions={fallbackForecast.slice(8)} unit="kW" color="#4299e1" />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.8rem", color: "#94a3b8" }}>
            {labels.slice(0, 6).map((l, i) => <span key={i}>{l}</span>)}
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-head">
            <div><h2>Active Power Prediction</h2><p>{predData?.active_power ? `${predData.active_power.predictions?.length || 0} predicted points` : "Waiting..."}</p></div>
            <span style={{ fontSize: "0.75rem", background: "#805ad5", color: "#fff", padding: "2px 10px", borderRadius: "10px", fontWeight: 600 }}>Python</span>
          </div>
          {predData?.active_power ? (
            <ForecastChart
              historical={[]}
              predictions={predData.active_power.predictions || []}
              ciLow={predData.active_power.ci_low || []}
              ciHigh={predData.active_power.ci_high || []}
              unit="kW" color="#ed8936"
            />
          ) : (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
              {loadingPred ? "Loading Python predictions..." : "No prediction data available"}
            </div>
          )}
        </section>
      </div>

      {/* Stats Python */}
      {predData && (
        <section className="section-block">
          <div className="section-title-wrap"><h2>Prediction Statistics</h2><p>Next {predData.horizon} points · {selectedLineLabel}</p></div>
          <div className="carbon-kpis">
            {[
              { key: "voltage",      label: "⚡ Voltage",     color: "#4299e1", unit: "V"  },
              { key: "power_factor", label: "↗ Power Factor", color: "#9f7aea", unit: ""   },
              { key: "active_power", label: "🔋 Active Power", color: "#ed8936", unit: "kW" },
            ].map(({ key, label, color, unit }) => {
              const p = predData[key];
              if (!p) return null;
              const trendColor = { increasing: "#e53e3e", decreasing: "#38a169", stable: "#888" }[p.stats?.trend] || "#888";
              return (
                <div className="carbon-card" key={key}>
                  <h4>{label}</h4>
                  <strong style={{ color }}>{p.predictions?.[0]?.toFixed(unit === "" ? 3 : 1)} {unit}</strong>
                  <span style={{ color: trendColor, fontWeight: 600 }}>{p.stats?.trend}</span>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", display: "block", marginTop: "0.2rem" }}>
                    Avg: {p.stats?.avg} · Std: {p.stats?.std} {unit}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Confidence: {p.confidence}%</span>
                </div>
              );
            })}
            {predData.active_power?.predictions?.[0] && (
              <div className="carbon-card">
                <h4>🌱 CO₂ Forecast</h4>
                <strong style={{ color: "#38a169" }}>{(predData.active_power.predictions[0] * 0.718).toFixed(1)} kg/h</strong>
                <span>Predicted kW × 0.718</span>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", display: "block" }}>ONEE Morocco</span>
              </div>
            )}
            {predData.active_power?.predictions?.[0] && (
              <div className="carbon-card">
                <h4>💰 Cost Forecast</h4>
                <strong style={{ color: "#d69e2e" }}>{((predData.active_power.predictions?.[0] || 0) * 0.14).toFixed(4)} $/h</strong>
                <span>Predicted electricity cost</span>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", display: "block" }}>Rate: 0.14 $/kWh</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Résumé par énergie */}
      <section className="section-block">
        <div className="section-title-wrap"><h2>Forecast Summary by Energy Type</h2><p>{view} view</p></div>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {energies.length > 0 ? (
            energies.map((energy) => (
              <div className="kpi-card" key={energy.id}>
                <div className="kpi-icon blue">📈</div>
                <h3>{(energy.value * (view === "daily" ? 1.05 : view === "weekly" ? 1.08 : 1.12)).toFixed(2)} {energy.unit}</h3>
                <p>Forecast {energy.name}</p>
                <span>Current: {energy.value.toFixed(2)} {energy.unit}</span>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#888" }}>No energy data — DataPlatform not connected.</div>
          )}
        </div>
      </section>
    </div>
  );
}