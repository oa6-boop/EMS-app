import { useState } from "react";
import { svgEventPoint, nearestIndex, SvgHoverTooltip } from "../components/ChartTooltip.jsx";

function formatValue(value, digits = 2, unit = "") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function LineChart({ title, data = [], unit = "", colorClass = "", nominal = null, timestamps = [] }) {
  const W = 760, H = 220, P = 30;
  const [hover, setHover] = useState(null);
  const vals = data.map(Number).filter((v) => Number.isFinite(v));
  const hasData = vals.length >= 2;
  const chartVals = hasData ? vals : [0, 0];
  const minV = Math.min(...chartVals), maxV = Math.max(...chartVals), rng = maxV - minV || 1;
  const toX = (i, n) => P + (i * (W - P * 2)) / Math.max(n - 1, 1);
  const toY = (v) => H - P - ((v - minV) / rng) * (H - P * 2);
  const points = chartVals.map((v, i) => `${toX(i, chartVals.length).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const nomY = nominal != null && maxV !== minV ? toY(nominal) : null;

  // Étiquette au survol : heure (si dispo) + valeur mesurée
  const handleMove = (evt) => {
    if (!hasData) return;
    const { x } = svgEventPoint(evt, W, H);
    const i = nearestIndex(x, P, W - P * 2, chartVals.length);
    const when = timestamps[i]
      ? new Date(timestamps[i]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : `Reading ${i + 1}/${chartVals.length}`;
    setHover({
      x: toX(i, chartVals.length),
      y: toY(chartVals[i]),
      lines: [when, `${Number(chartVals[i]).toFixed(unit === "" ? 3 : 2)} ${unit}`.trim()],
    });
  };

  return (
    <div className={`svg-chart-card ${colorClass}`}>
      <div className="svg-chart-head">
        <h4>{title}</h4>
        <span>{hasData ? `${vals[vals.length - 1].toFixed(unit === "" ? 3 : 1)} ${unit}` : "Waiting..."}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="svg-line-chart" preserveAspectRatio="none"
        onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((r) => (
          <line key={r} x1={P} y1={P + r * ((H - P * 2) / 4)} x2={W - P} y2={P + r * ((H - P * 2) / 4)} className="svg-grid-line" />
        ))}
        {nomY != null && <line x1={P} y1={nomY} x2={W - P} y2={nomY} stroke="#f6ad55" strokeWidth="1" strokeDasharray="6,4" opacity="0.7" />}
        {hasData && <polyline fill="none" points={points} className="svg-main-line" />}
        {hasData && chartVals.map((v, i) => <circle key={i} cx={toX(i, chartVals.length)} cy={toY(v)} r="3" className="svg-point" />)}
        {hover && (
          <SvgHoverTooltip {...hover} W={W} H={H} color="#4299e1" guideTop={P} guideBottom={H - P} />
        )}
      </svg>
      {!hasData && <p style={{ textAlign: "center", color: "#888", fontSize: "0.85rem", marginTop: "-0.5rem" }}>Waiting for DataPlatform data...</p>}
    </div>
  );
}

export default function PowerQuality({ data = {}, powerQualityHistory = [], selectedLineLabel = "Production Line 1" }) {
  // Paires valeur + timestamp alignées (pour l'étiquette au survol des graphes)
  const pick = (field, cond) => {
    const pts = powerQualityHistory.filter((p) => cond(p[field]));
    return { values: pts.map((p) => p[field]), times: pts.map((p) => p.timestamp) };
  };
  const voltPts = pick("voltage",      (v) => Number(v) > 0);
  const freqPts = pick("frequency",    (v) => Number(v) > 0);
  const pfPts   = pick("power_factor", (v) => Number(v) > 0);
  const thdPts  = pick("thd",          (v) => Number(v) >= 0);
  const kwPts   = pick("kw",           (v) => v != null);

  const voltages     = voltPts.values;
  const frequencies  = freqPts.values;
  const powerFactors = pfPts.values;
  const thds         = thdPts.values;
  const kwValues     = kwPts.values;

  const latest = powerQualityHistory[powerQualityHistory.length - 1] || {};
  const tension = data.tension ?? latest.voltage ?? null;
  const frequence = data.frequence ?? latest.frequency ?? null;
  const pf = data.facteurPuissance ?? latest.power_factor ?? null;
  const thd = data.thd ?? latest.thd ?? null;

  const hasData = tension != null || frequence != null || pf != null || thd != null || powerQualityHistory.length > 0;

  const voltStatus = tension == null ? "Waiting" : tension >= 210 && tension <= 250 ? "Stable ✓" : "Out of range ⚠";
  const freqStatus = frequence == null ? "Waiting" : frequence >= 49 && frequence <= 51 ? "Normal ✓" : "Anomaly ⚠";
  const pfStatus = pf == null ? "Waiting" : pf >= 0.9 ? "Good ✓" : pf >= 0.85 ? "Acceptable" : "Low ⚠";
  const thdStatus = thd == null ? "Waiting" : thd <= 5 ? "Compliant ✓" : "High ⚠";

  const pfColor = pf == null ? "#64748b" : pf >= 0.9 ? "#38a169" : pf >= 0.85 ? "#d69e2e" : "#e53e3e";
  const thdColor = thd == null ? "#64748b" : thd <= 5 ? "#38a169" : "#e53e3e";
  const voltColor = tension == null ? "#64748b" : tension >= 210 && tension <= 250 ? "#38a169" : "#e53e3e";
  const freqColor = frequence == null ? "#64748b" : frequence >= 49 && frequence <= 51 ? "#38a169" : "#e53e3e";

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Power Quality</h1>
        <p>Electrical measurements — {selectedLineLabel}</p>
      </div>

      {!hasData && <div className="info-box" style={{ marginBottom: "1rem" }}>⏳ Waiting for Power Quality data from DataPlatform...</div>}

      <section className="section-block">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">⚡</div>
            <div className="kpi-badge" style={{ background: voltColor }}>{voltStatus}</div>
            <h3 style={{ color: voltColor }}>{formatValue(tension, 1, "V")}</h3>
            <p>Voltage</p>
            <span>Nominal: 230 V · Range: 210–250 V</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon emerald">〰</div>
            <div className="kpi-badge" style={{ background: freqColor }}>{freqStatus}</div>
            <h3 style={{ color: freqColor }}>{formatValue(frequence, 2, "Hz")}</h3>
            <p>Frequency</p>
            <span>Nominal: 50 Hz · Range: 49–51 Hz</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon purple">↗</div>
            <div className="kpi-badge" style={{ background: pfColor }}>{pfStatus}</div>
            <h3 style={{ color: pfColor }}>{formatValue(pf, 3)}</h3>
            <p>Power Factor</p>
            <span>Target: ≥0.90</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon orange">⚠</div>
            <div className="kpi-badge" style={{ background: thdColor }}>{thdStatus}</div>
            <h3 style={{ color: thdColor }}>{formatValue(thd, 2, "%")}</h3>
            <p>Total Harmonic Distortion</p>
            <span>IEC 61000 Limit: 5%</span>
          </div>
        </div>
      </section>

      <div className="section-title-wrap" style={{ marginTop: "1.5rem" }}>
        <h2>Real-Time Trends</h2>
        <p>{powerQualityHistory.length > 0 ? `${powerQualityHistory.length} data points` : "Waiting..."}</p>
      </div>

      <div className="power-quality-grid">
        <LineChart title="Voltage Trend" data={voltages} unit="V" colorClass="chart-blue" nominal={230} timestamps={voltPts.times} />
        <LineChart title="Frequency Trend" data={frequencies} unit="Hz" colorClass="chart-cyan" nominal={50} timestamps={freqPts.times} />
        <LineChart title="Power Factor Trend" data={powerFactors} unit="" colorClass="chart-purple" nominal={0.9} timestamps={pfPts.times} />
        {thds.length > 0 && <LineChart title="THD Trend" data={thds} unit="%" colorClass="chart-orange" nominal={5} timestamps={thdPts.times} />}
        {kwValues.length > 0 && <LineChart title="Active Power Trend" data={kwValues} unit="kW" colorClass="chart-orange" timestamps={kwPts.times} />}
      </div>
    </div>
  );
}
