import { useState } from "react";
import { svgEventPoint, nearestIndex, SvgHoverTooltip } from "../components/ChartTooltip.jsx";

const CO2_FACTOR = 0.718; // kgCO₂/kWh — ONEE Maroc

function CarbonLineChart({ data = [], labels = [], timestamps = [] }) {
  const W = 760, H = 240, P = 36;
  const [hover, setHover] = useState(null);
  const hasData = data.length >= 2;
  const vals    = hasData ? data : [0, 0];
  const minV = Math.min(...vals), maxV = Math.max(...vals), rng = maxV - minV || 1;
  const toX = (i, n) => P + (i * (W - P * 2)) / Math.max(n - 1, 1);
  const toY = (v)    => H - P - ((v - minV) / rng) * (H - P * 2);
  const points = vals.map((v, i) => `${toX(i, vals.length).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  // Étiquette au survol : suit le curseur et affiche heure + valeur du point
  const handleMove = (evt) => {
    if (!hasData) return;
    const { x } = svgEventPoint(evt, W, H);
    const i = nearestIndex(x, P, W - P * 2, vals.length);
    const when = timestamps[i]
      ? new Date(timestamps[i]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : labels?.[i] || `Point ${i + 1}`;
    setHover({
      x: toX(i, vals.length),
      y: toY(vals[i]),
      lines: [when, `${Number(vals[i]).toFixed(3)} kgCO₂`],
    });
  };

  return (
    <div className="svg-chart-card chart-green">
      <div className="svg-chart-head">
        <h4>CO₂ Emissions Trend (kgCO₂)</h4>
        <span>{hasData ? `Latest: ${vals[vals.length - 1].toFixed(3)} kg` : "Waiting for CO₂ data..."}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="svg-line-chart" preserveAspectRatio="none"
        onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
        {[0,1,2,3,4].map(r => (
          <line key={r} x1={P} y1={P + r * ((H - P*2) / 4)} x2={W-P} y2={P + r * ((H - P*2) / 4)} className="svg-grid-line" />
        ))}
        {hasData && <polyline points={points} fill="none" className="svg-main-line" />}
        {hasData && vals.map((v, i) => (
          <circle key={i} cx={toX(i, vals.length)} cy={toY(v)} r="3" className="svg-point" />
        ))}
        {(labels.length > 0 ? labels : []).map((label, i) => {
          const idx = Math.min(i * Math.max(1, Math.floor(vals.length / Math.max(labels.length - 1, 1))), vals.length - 1);
          return <text key={i} x={toX(idx, vals.length)} y={H - 8} textAnchor="middle" className="svg-axis-label">{label}</text>;
        })}
        {hover && (
          <SvgHoverTooltip {...hover} W={W} H={H} color="#38a169" guideTop={P} guideBottom={H - P} />
        )}
      </svg>
      {!hasData && <p style={{ textAlign: "center", color: "#888", fontSize: "0.85rem" }}>Waiting for DataPlatform CO₂ data...</p>}
    </div>
  );
}

export default function CarbonEmissions({ energies = [], carbonHistory = [], totalCo2 = 0, selectedLineLabel = "Production Line 1" }) {

  // Filtrer UNIQUEMENT les énergies CO2 (pas l'électricité)
  const co2Energies = energies.filter(e => {
    const name = e.name.toLowerCase();
    const unit = e.unit.toLowerCase();
    return name.includes("co2") || name.includes("co₂") || name.includes("carbon") || name.includes("emission") || unit.includes("kgco2") || unit === "tco2e";
  });

  // Énergie kWh pour calcul CO2 si pas de mesure directe
  const kwhEnergy = energies.find(e => e.unit?.toLowerCase() === "kwh" || e.name?.toLowerCase().includes("kwh"));

  // CO2 actuel: préférence aux mesures directes
  const directCo2 = co2Energies.length > 0 ? co2Energies.reduce((s, e) => s + e.value, 0) : 0;
  const calculatedCo2 = kwhEnergy ? parseFloat((kwhEnergy.value * CO2_FACTOR).toFixed(3)) : 0;
  const currentCo2Kg  = totalCo2 > 0 ? totalCo2 : directCo2 > 0 ? directCo2 : calculatedCo2;
  const currentCo2Tonnes = currentCo2Kg / 1000;

  // Déterminer la source des données
  const dataSource = co2Energies.length > 0 ? "Direct measurement (DataPlatform)" : "Calculated: kWh × 0.718 (ONEE Morocco)";
  const hasDirectData = co2Energies.length > 0;

  // Séries CO2 depuis l'historique backend (valeurs + timestamps alignés
  // pour l'étiquette au survol du graphe)
  const co2Points    = carbonHistory.filter(p => p.co2_kg != null);
  const co2Series    = co2Points.map(p => p.co2_kg);
  const co2Times     = co2Points.map(p => p.timestamp);
  const totalCo2Acc  = carbonHistory.reduce((s, p) => s + (p.co2_kg || 0), 0);
  const totalKwhAcc  = carbonHistory.reduce((s, p) => s + (p.kwh    || 0), 0);
  const avgIntensity = totalKwhAcc > 0 ? (totalCo2Acc / totalKwhAcc).toFixed(3) : CO2_FACTOR.toFixed(3);

  const labelCount = Math.min(7, co2Series.length);
  const labels = Array.from({ length: labelCount }, (_, i) => i === labelCount - 1 ? "now" : `-${(labelCount - 1 - i) * 2}m`);

  // Objectif mensuel : -5 %. L'avancement est CALCULÉ depuis les données
  // réelles de la DataPlatform : variation des émissions moyennes entre la
  // première et la seconde moitié de l'historique reçu (positif = réduction).
  // Sans données → "—" (rien n'est simulé).
  const TARGET_PCT = 5;
  let achieved = null;
  if (co2Series.length >= 8) {
    const half = Math.floor(co2Series.length / 2);
    const avgFirst  = co2Series.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const avgSecond = co2Series.slice(half).reduce((s, v) => s + v, 0) / (co2Series.length - half);
    if (avgFirst > 0) {
      achieved = parseFloat((((avgFirst - avgSecond) / avgFirst) * 100).toFixed(1));
    }
  }
  const progressPct = achieved != null
    ? Math.max(0, Math.min(100, (achieved / TARGET_PCT) * 100)).toFixed(0)
    : null;

  // KPI CO2 par équipement
  const equipmentCo2 = {};
  carbonHistory.forEach(r => {
    if (!r.equipment) return;
    if (!equipmentCo2[r.equipment]) equipmentCo2[r.equipment] = { total: 0, count: 0 };
    equipmentCo2[r.equipment].total += r.co2_kg || 0;
    equipmentCo2[r.equipment].count += 1;
  });

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Carbon Emissions</h1>
        <p>
          CO₂ monitoring for {selectedLineLabel}
          <br />
          
        </p>
      </div>

      {/* Alerte si aucune mesure directe */}
      {!hasDirectData && co2Series.length === 0 && (
        <div className="info-box" style={{ marginBottom: "1rem" }}>
          ℹ️ No direct CO₂ data yet. CO₂ is calculated from kWh × {CO2_FACTOR}. Waiting for DataPlatform...
        </div>
      )}

      {/* KPIs CO₂ UNIQUEMENT */}
      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>🌱 Current CO₂</h4>
            <strong style={{ color: "#38a169" }}>{currentCo2Kg.toFixed(3)} kg</strong>
            <span>{hasDirectData ? "" : `From ${kwhEnergy ? kwhEnergy.value.toFixed(2) + " kWh" : "kWh data"}`}</span>
          </div>

          <div className="carbon-card">
            <h4>📈 Accumulated CO₂</h4>
            <strong>{totalCo2Acc.toFixed(2)} kg</strong>
            <span>From {carbonHistory.length} readings on {selectedLineLabel}</span>
          </div>

          <div className="carbon-card">
            <h4>⚖️ Tonnes équivalent</h4>
            <strong>{currentCo2Tonnes.toFixed(5)} tCO₂e</strong>
          </div>

          <div className="carbon-card">
            <h4>📊 Carbon Intensity</h4>
            <strong>{avgIntensity} kgCO₂/kWh</strong>
          </div>

          {/* Énergies CO2 directes si disponibles */}
          {co2Energies.map((e, i) => (
            <div className="carbon-card" key={i}>
              <h4>🔴 {e.rawData?.equipment || "CO₂ Meter"}</h4>
              <strong style={{ color: "#e53e3e" }}>{e.value.toFixed(3)} {e.unit}</strong>
              <span>Direct measurement · {e.rawData?.area || ""}</span>
            </div>
          ))}

          <div className="carbon-card">
            <h4>⚡ Energy consumed</h4>
            <strong>{totalKwhAcc > 0 ? `${totalKwhAcc.toFixed(2)} kWh` : kwhEnergy ? `${kwhEnergy.value.toFixed(2)} kWh` : "—"}</strong>
            <span>Electricity generating these emissions</span>
          </div>
        </div>
      </section>

      {/* Graphe CO2 + Cibles */}
      <div className="two-column-layout carbon-layout" style={{ marginTop: "1.5rem" }}>
        <section className="panel-card">
          <div className="panel-head">
            <div>
              <h2>CO₂ Trend</h2>
              <p>
                {co2Series.length > 0
                  ? `${co2Series.length} CO₂ data points — Source: ${hasDirectData ? "direct" : "calculated"}`
                  : "Waiting for CO₂ data from DataPlatform..."}
              </p>
            </div>
          </div>
          <CarbonLineChart data={co2Series} labels={labels} timestamps={co2Times} />
        </section>

        <section className="panel-card target-card">
          <div className="panel-head">
            <div><h2>Reduction Target</h2><p>Monthly CO₂ performance</p></div>
          </div>
          <div className="progress-circle">{progressPct != null ? `${progressPct}%` : "—"}</div>
          <div className="target-metrics">
            <div><span>Monthly Target</span><strong>-{TARGET_PCT}% CO₂ reduction</strong></div>
            <div>
              <span>Current Achievement</span>
              <strong className={achieved != null && achieved >= 0 ? "green-text" : "yellow-text"}>
                {achieved != null ? `${achieved >= 0 ? "-" : "+"}${Math.abs(achieved)}%` : "— waiting data"}
              </strong>
            </div>
            <div>
              <span>Remaining</span>
              <strong className="yellow-text">
                {achieved != null ? `${Math.max(0, TARGET_PCT - achieved).toFixed(1)}% to go` : "—"}
              </strong>
            </div>
            <div><span>Emission Factor</span><strong>{CO2_FACTOR} kgCO₂/kWh (ONEE)</strong></div>
          </div>
          <div className="target-status">
            {carbonHistory.length > 0 ? "✅ Live CO₂ data " : "⏳ Waiting for DataPlatform data..."}
          </div>
        </section>
      </div>

      {/* CO2 par équipement */}
      {Object.keys(equipmentCo2).length > 0 && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>CO₂ by Equipment</h2>
            <p>Emission contribution per  meter</p>
          </div>
          <div className="carbon-kpis">
            {Object.entries(equipmentCo2).sort((a, b) => b[1].total - a[1].total).map(([eq, data]) => (
              <div className="carbon-card" key={eq}>
                <h4>⚙ {eq}</h4>
                <strong>{data.total.toFixed(3)} kg</strong>
                <span>{data.count} readings · avg {(data.total / data.count).toFixed(3)} kg</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tableau CO2 détaillé */}
      {carbonHistory.length > 0 && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>CO₂ History</h2>
            <p>Last {Math.min(carbonHistory.length, 20)} records </p>
          </div>
          <div className="table-card">
            <table>
              <thead>
                <tr><th>Time</th><th>Equipment</th><th>Unit</th><th>kWh</th><th>CO₂ (kg)</th><th>Factor</th><th>Source</th></tr>
              </thead>
              <tbody>
                {[...carbonHistory].reverse().slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: "0.8rem", color: "#888" }}>{new Date(row.timestamp).toLocaleTimeString()}</td>
                    <td>{row.equipment || "—"}</td>
                    <td>{row.unit_name || "—"}</td>
                    <td>{row.kwh != null ? row.kwh.toFixed(3) : "—"}</td>
                    <td><strong style={{ color: "#38a169" }}>{row.co2_kg.toFixed(3)}</strong></td>
                    <td>{CO2_FACTOR}</td>
                    <td style={{ fontSize: "0.75rem", color: "#888" }}>{row.source || "calculated"}</td>
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