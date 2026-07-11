import { useEffect, useMemo, useState } from "react";
import { fetchChartData, fetchLineHistory } from "../api/emsApi";
import { aggregateByEnergy, isAggregateRollup, SUMMABLE_UNITS } from "../utils/energyAggregation.js";
import { svgEventPoint, nearestIndex, SvgHoverTooltip } from "../components/ChartTooltip.jsx";

const CO2_FACTOR = 0.718; // kgCO₂/kWh — ONEE Maroc

// ─── Régression linéaire sur les points RÉELS → prochains points ─────────────
// Même méthode que le backend (charts.py::predict_next) : aucune valeur
// inventée, la projection découle uniquement de l'historique DataPlatform.
function linearForecast(values, steps = 6) {
  if (!values || values.length < 3) return [];
  const n = values.length;
  const xs = values.map((_, i) => i);
  const sx = xs.reduce((s, v) => s + v, 0);
  const sy = values.reduce((s, v) => s + v, 0);
  const sxy = xs.reduce((s, x, i) => s + x * values[i], 0);
  const sxx = xs.reduce((s, x) => s + x * x, 0);
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-9) return Array(steps).fill(+values[n - 1].toFixed(3));
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  return Array.from({ length: steps }, (_, i) =>
    Math.max(0, +(slope * (n + i) + intercept).toFixed(3))
  );
}

// ─── Séries temporelles réelles PAR ÉNERGIE (bucket 1 minute) ────────────────
// Équipements physiques uniquement (un rollup n'est gardé que si son énergie
// n'existe sur aucun équipement). Somme par minute pour les consommations,
// moyenne pour les grandeurs de qualité — comme partout dans l'app.
function buildEnergySeries(records = []) {
  const phys = records.filter((r) => !isAggregateRollup(r));
  const physNames = new Set(phys.map((r) => r.energy_name));
  const source = [
    ...phys,
    ...records.filter((r) => isAggregateRollup(r) && !physNames.has(r.energy_name)),
  ];

  const byEnergy = {};
  source.forEach((r) => {
    if (!r.energy_name || r.value == null) return;
    const minute = String(r.timestamp || "").slice(0, 16);
    const e = (byEnergy[r.energy_name] = byEnergy[r.energy_name] || { unit: r.unit || "", buckets: {} });
    const b = (e.buckets[minute] = e.buckets[minute] || { sum: 0, n: 0 });
    b.sum += Number(r.value || 0);
    b.n += 1;
  });

  const out = {};
  Object.entries(byEnergy).forEach(([name, e]) => {
    const keys = Object.keys(e.buckets).sort();
    const values = keys.map((k) =>
      SUMMABLE_UNITS.has(e.unit) ? e.buckets[k].sum : e.buckets[k].sum / e.buckets[k].n
    );
    out[name] = { unit: e.unit, values: values.slice(-24) };
  });
  return out;
}

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
  const [ap, setAp] = useState(null); // active_power RÉEL : historique + prédictions régression

  // Prévision RÉELLE : le backend applique une régression linéaire sur
  // l'historique réel de la DataPlatform (puissance active). Aucune valeur
  // n'est inventée — on récupère l'historique réel + les points prédits.
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchChartData(selectedLineLabel, 40)
        .then((d) => { if (alive) setAp(d?.active_power || null); })
        .catch(() => {});
    load();
    const iv = setInterval(load, 10000);
    return () => { alive = false; clearInterval(iv); };
  }, [selectedLineLabel]);

  const realHistory     = ap?.values || [];
  const realPredictions = ap?.predictions || [];
  const hasReal         = realHistory.length >= 2;

  // Historique réel PAR ÉNERGIE (DataPlatform) → une projection par énergie.
  const [energySeries, setEnergySeries] = useState({});
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchLineHistory(selectedLineLabel, 400)
        .then((rs) => { if (alive) setEnergySeries(buildEnergySeries(rs || [])); })
        .catch(() => {});
    load();
    const iv = setInterval(load, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [selectedLineLabel]);

  // Série CO₂ : mesure directe si la DataPlatform la publie, sinon dérivée du
  // compteur kWh réel × 0.718 (même convention que la page Carbon Emissions).
  const co2Series = useMemo(() => {
    const direct = Object.entries(energySeries).find(([n]) => /co2|co₂/i.test(n));
    if (direct && direct[1].values.length >= 3) {
      return { unit: direct[1].unit || "kgCO2", values: direct[1].values, source: "direct" };
    }
    const kwh = energySeries["Electricity-kWh"];
    if (kwh && kwh.values.length >= 3) {
      return { unit: "kgCO2", values: kwh.values.map((v) => +(v * CO2_FACTOR).toFixed(3)), source: "kWh × 0.718" };
    }
    return null;
  }, [energySeries]);

  // Graphes de projection par énergie : les énergies FACTURABLES présentes.
  const FORECAST_ENERGIES = [
    { name: "Electricity-kWh", label: "Electricity (kWh)", tab: "⚡ Electricity", color: "#7c3aed" },
    { name: "Water",           label: "Water (m³)",        tab: "💧 Water",       color: "#0284c7" },
    { name: "Steam",           label: "Steam (tonne)",     tab: "♨️ Steam",       color: "#ed8936" },
    { name: "Fuel",            label: "Fuel (L)",          tab: "⛽ Fuel",        color: "#e53e3e" },
  ];
  const forecastCharts = FORECAST_ENERGIES
    .map((fe) => ({ ...fe, serie: energySeries[fe.name] }))
    .filter((fe) => fe.serie && fe.serie.values.length >= 3)
    .map((fe) => ({ ...fe, predictions: linearForecast(fe.serie.values, 6) }));

  const co2Predictions = co2Series ? linearForecast(co2Series.values, 6) : [];

  // UN graphe + filtre : chaque bouton bascule sur la série réelle de
  // l'énergie choisie (électricité, eau, vapeur, fuel, CO₂).
  const forecastOptions = [
    ...forecastCharts.map((fe) => ({
      key: fe.name, label: fe.label, tab: fe.tab, color: fe.color,
      serie: fe.serie, predictions: fe.predictions,
    })),
    ...(co2Series && co2Predictions.length > 0
      ? [{
          key: "CO2", label: `CO₂ (kg) — ${co2Series.source}`, tab: "🌱 CO₂",
          color: "#38a169", serie: { unit: "kg", values: co2Series.values },
          predictions: co2Predictions,
        }]
      : []),
  ];
  const [selectedForecast, setSelectedForecast] = useState("");
  const activeForecast =
    forecastOptions.find((o) => o.key === selectedForecast) || forecastOptions[0];

  const electricEnergies = energies.filter((e) => e.unit === "kW");
  const totalKw          = electricEnergies.reduce((s, e) => s + e.value, 0);
  const kwhE             = energies.find((e) => e.unit === "kWh");

  // Tendance dérivée UNIQUEMENT des vraies prédictions (moyenne des points
  // prédits / moyenne récente). Null si pas assez de données réelles → on
  // n'affiche alors AUCUNE projection inventée.
  const trend = useMemo(() => {
    if (!hasReal || realPredictions.length === 0) return null;
    const recent = realHistory.slice(-5);
    const avgNow = recent.reduce((s, v) => s + v, 0) / recent.length;
    const avgFut = realPredictions.reduce((s, v) => s + v, 0) / realPredictions.length;
    return avgNow > 0 ? avgFut / avgNow : null;
  }, [hasReal, realHistory, realPredictions]);

  // Résumé par énergie : UNE carte par énergie, agrégée sur les ÉQUIPEMENTS
  // physiques (un rollup n'est gardé que si son énergie n'existe nulle part
  // ailleurs — sinon double comptage avec le total de ligne).
  const physicalList = energies.filter((e) => !isAggregateRollup(e));
  const physNames = new Set(physicalList.map((e) => String(e.name || "").toLowerCase()));
  const kpiSource = [
    ...physicalList,
    ...energies.filter(
      (e) => isAggregateRollup(e) && !physNames.has(String(e.name || "").toLowerCase())
    ),
  ];
  const energySummary = aggregateByEnergy(kpiSource);

  // Projection PAR énergie : régression sur SA propre série réelle ;
  // à défaut, la tendance globale (kW) ; sinon aucune projection.
  const forecastFor = (energy) => {
    const serie = energySeries[energy.name];
    if (serie && serie.values.length >= 3) {
      const preds = linearForecast(serie.values, 3);
      if (preds.length) return preds[preds.length - 1];
    }
    return trend != null ? energy.value * trend : null;
  };

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
              {totalKw > 0 && trend != null ? `${(totalKw * trend).toFixed(1)} kW` : "—"}
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

          {co2Predictions.length > 0 ? (
            <div className="kpi-card">
              <div className="kpi-icon leaf" style={{ color: "#38a169" }}>🌱</div>
              <div className="kpi-badge" style={{ background: "#38a169" }}>Forecast</div>
              <h3 style={{ color: "#38a169" }}>
                {co2Predictions[co2Predictions.length - 1].toFixed(2)} kg
              </h3>
              <p>Forecast CO₂ (next window)</p>
              <span>Regression on real CO₂ series ({co2Series.source})</span>
            </div>
          ) : totalKw > 0 && trend != null && (
            <div className="kpi-card">
              <div className="kpi-icon leaf" style={{ color: "#38a169" }}>🌱</div>
              <div className="kpi-badge" style={{ background: "#38a169" }}>Forecast</div>
              <h3 style={{ color: "#38a169" }}>
                {(totalKw * trend * 0.718 / 1000).toFixed(4)} tCO₂e/h
              </h3>
              <p>Forecast CO₂ Rate</p>
              <span>predicted kW × 0.718 / 1000</span>
            </div>
          )}
        </div>
      </section>

      {/* Graphe : historique RÉEL + prédictions par régression (backend) */}
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <h2>Load Forecasting — Active Power (kW)</h2>
            <p>· {realHistory.length} live points</p>
          </div>
        </div>
        {hasReal ? (
          <ForecastChart
            historical={realHistory}
            predictions={realPredictions}
            unit="kW"
            color="#4299e1"
          />
        ) : (
          <div style={{ textAlign: "center", padding: "2rem", color: "#888" }}>
            ⏳ Waiting for enough real active-power history to forecast…
          </div>
        )}
      </section>

      {/* Projections PAR ÉNERGIE : UN graphe + filtre par énergie.
          Historique réel (1 pt/min) + régression — eau, fuel, vapeur, CO₂. */}
      {forecastOptions.length > 0 && activeForecast && (
        <section className="panel-card">
          <div className="panel-head">
            <div>
              <h2>Forecast by Energy Type — {activeForecast.label}</h2>
              <p>
                {activeForecast.serie.values.length} real points · +
                {activeForecast.predictions.length} forecast (linear regression)
              </p>
            </div>
            <div className="switch-tags">
              {forecastOptions.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={activeForecast.key === o.key ? "active" : ""}
                  onClick={() => setSelectedForecast(o.key)}
                >
                  {o.tab}
                </button>
              ))}
            </div>
          </div>
          <ForecastChart
            historical={activeForecast.serie.values}
            predictions={activeForecast.predictions}
            unit={activeForecast.serie.unit}
            color={activeForecast.color}
          />
        </section>
      )}

      {/* Résumé par énergie */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Forecast Summary by Energy Type</h2>
          <p>Each energy projected with the regression of its own real series</p>
        </div>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {energySummary.length > 0 ? (
            energySummary.map((energy) => {
              const predicted = forecastFor(energy);
              return (
                <div className="kpi-card" key={`${energy.name}-${energy.unit}`}>
                  <div className="kpi-icon blue">📈</div>
                  <h3>{predicted != null ? `${predicted.toFixed(2)} ${energy.unit}` : "—"}</h3>
                  <p>Forecast {energy.name}</p>
                  <span>Current: {energy.value.toFixed(2)} {energy.unit}</span>
                </div>
              );
            })
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