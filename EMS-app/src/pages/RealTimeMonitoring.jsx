import { useEffect, useState } from "react";
import { fetchChartData, fetchPredictions } from "../api/emsApi";

// ─── Composant graphe SVG ─────────────────────────────────────────────────────
function LiveChart({ chartData, height = 200 }) {
  if (!chartData) return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: "0.85rem" }}>
      Waiting for data...
    </div>
  );

  const { values = [], predictions = [], nominal, min_alarm, max_alarm, unit, color = "#4299e1" } = chartData;

  if (values.length < 2) return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: "0.85rem" }}>
      Collecting data... ({values.length} point{values.length !== 1 ? "s" : ""})
    </div>
  );

  const W = 700, H = height, PX = 45, PY = 20;
  const allVals = [...values, ...predictions];
  const minV    = Math.min(...allVals) * 0.98;
  const maxV    = Math.max(...allVals) * 1.02 || 1;
  const rng     = maxV - minV || 1;

  const toX = (i, total) => PX + (i * (W - PX - 10)) / Math.max(total - 1, 1);
  const toY = (v) => PY + (1 - (v - minV) / rng) * (H - PY - 25);

  const histPoints = values
    .map((v, i) => `${toX(i, values.length + predictions.length).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(" ");

  const predStartX = toX(values.length - 1, values.length + predictions.length);
  const predPoints = [
    `${predStartX.toFixed(1)},${toY(values[values.length - 1]).toFixed(1)}`,
    ...predictions.map((v, i) =>
      `${toX(values.length + i, values.length + predictions.length).toFixed(1)},${toY(v).toFixed(1)}`
    ),
  ].join(" ");

  const nominalY  = nominal   != null ? toY(nominal)   : null;
  const minAlarmY = min_alarm != null ? toY(min_alarm)  : null;
  const maxAlarmY = max_alarm != null ? toY(max_alarm)  : null;

  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (rng * i) / 4;
    return { v: v.toFixed(unit === "" ? 3 : 1), y: toY(v) };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: H, overflow: "visible" }}
      preserveAspectRatio="none"
    >
      {yLabels.map((l, i) => (
        <g key={i}>
          <line x1={PX} y1={l.y} x2={W - 10} y2={l.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
          <text x={PX - 5} y={l.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{l.v}</text>
        </g>
      ))}

      {maxAlarmY != null && maxAlarmY >= PY && (
        <line x1={PX} y1={maxAlarmY} x2={W - 10} y2={maxAlarmY}
          stroke="#e53e3e" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
      )}

      {minAlarmY != null && minAlarmY <= H - 25 && (
        <line x1={PX} y1={minAlarmY} x2={W - 10} y2={minAlarmY}
          stroke="#ed8936" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
      )}

      {nominalY != null && (
        <line x1={PX} y1={nominalY} x2={W - 10} y2={nominalY}
          stroke="#ecc94b" strokeWidth="1" strokeDasharray="8,4" opacity="0.8" />
      )}

      <defs>
        <linearGradient id={`grad-${unit}-rt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      <polygon
        points={`${PX},${H - 25} ${histPoints} ${toX(values.length - 1, values.length + predictions.length).toFixed(1)},${H - 25}`}
        fill={`url(#grad-${unit}-rt)`}
      />

      <polyline
        fill="none" stroke={color} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round"
        points={histPoints}
      />

      {predictions.length > 0 && (
        <polyline
          fill="none" stroke={color} strokeWidth="2"
          strokeDasharray="6,4" strokeLinejoin="round" strokeLinecap="round"
          points={predPoints} opacity="0.6"
        />
      )}

      {predictions.length > 0 && (
        <line
          x1={predStartX} y1={PY} x2={predStartX} y2={H - 25}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,3"
        />
      )}

      {values.slice(-5).map((v, i) => {
        const idx = values.length - 5 + i;
        return (
          <circle
            key={i}
            cx={toX(idx, values.length + predictions.length)}
            cy={toY(v)}
            r="3.5" fill={color} stroke="white" strokeWidth="1.5"
          />
        );
      })}

      {predictions.length > 0 && (
        <circle
          cx={toX(values.length + predictions.length - 1, values.length + predictions.length)}
          cy={toY(predictions[predictions.length - 1])}
          r="4" fill={color} stroke="white" strokeWidth="2" opacity="0.7"
        />
      )}

      <text x={PX} y={H - 8} fontSize="10" fill="#94a3b8">oldest</text>
      <text x={predStartX} y={H - 8} fontSize="10" fill="#94a3b8" textAnchor="middle">now</text>
      {predictions.length > 0 && (
        <text x={W - 10} y={H - 8} fontSize="10" fill={color} textAnchor="end" opacity="0.7">
          +{predictions.length} pred.
        </text>
      )}
    </svg>
  );
}

// ─── Carte graphe ─────────────────────────────────────────────────────────────
function ChartCard({ title, chartData, loading }) {
  if (!chartData && !loading) return null;

  const stats      = chartData?.stats;
  const trendIcon  = { increasing: "↗", decreasing: "↘", stable: "→" }[stats?.trend] || "→";
  const trendColor = { increasing: "#e53e3e", decreasing: "#38a169", stable: "#888" }[stats?.trend] || "#888";
  const unit       = chartData?.unit || "";

  return (
    <div className="panel-card" style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{title}</h3>
          {stats && !loading && (
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "#64748b" }}>
              Avg: <strong>{stats.avg}{unit}</strong> · Min: {stats.min}{unit} · Max: {stats.max}{unit}
              <span style={{ color: trendColor, marginLeft: "0.5rem", fontWeight: 600 }}>
                {trendIcon} {stats.trend}
              </span>
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {!loading && (
            <span style={{ fontSize: "0.7rem", background: "#dcfce7", color: "#16a34a", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
              ● Live
            </span>
          )}
          {loading && (
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Loading...</span>
          )}
        </div>
      </div>

      {chartData?.values?.length > 0 && !loading && (
        <div style={{ marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "1.8rem", fontWeight: 700, color: chartData.color || "#333" }}>
            {chartData.values[chartData.values.length - 1].toFixed(unit === "" ? 3 : 1)}
          </span>
          <span style={{ fontSize: "0.9rem", color: "#94a3b8", marginLeft: "0.3rem" }}>{unit}</span>
          {chartData.predictions?.length > 0 && (
            <span style={{ fontSize: "0.8rem", color: chartData.color || "#4299e1", marginLeft: "1rem", opacity: 0.75 }}>
              → Predicted: {chartData.predictions[0].toFixed(unit === "" ? 3 : 1)}{unit}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", fontSize: "0.72rem", color: "#94a3b8", marginBottom: "0.5rem" }}>
        {chartData?.nominal   != null && <span style={{ color: "#b7791f" }}>— Nominal: {chartData.nominal}{unit}</span>}
        {chartData?.min_alarm != null && <span style={{ color: "#ed8936" }}>— Min alarm: {chartData.min_alarm}{unit}</span>}
        {chartData?.max_alarm != null && <span style={{ color: "#e53e3e" }}>— Max alarm: {chartData.max_alarm}{unit}</span>}
        {chartData?.predictions?.length > 0 && <span style={{ color: chartData.color, opacity: 0.7 }}>- - - Prediction</span>}
      </div>

      <LiveChart chartData={chartData} height={180} />
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function RealTimeMonitoring({
  data                = {},
  powerQualityHistory = [],
  energies            = [],
  selectedLineLabel   = "Production Line 1",
}) {
  const [chartData,     setChartData]     = useState(null);
  const [predictions,   setPredictions]   = useState(null);
  const [loadingCharts, setLoadingCharts] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoadingCharts(true);
      try {
        const [charts, preds] = await Promise.all([
          fetchChartData(selectedLineLabel, 30),
          fetchPredictions(selectedLineLabel, 8),
        ]);
        setChartData(charts);
        setPredictions(preds);
      } catch (err) {
        console.error("Chart data error:", err);
      } finally {
        setLoadingCharts(false);
      }
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [selectedLineLabel]);

  const tension   = data.tension          ?? 415;
  const frequence = data.frequence        ?? 50;
  const pf        = data.facteurPuissance ?? 0.94;
  const thd       = data.thd             ?? 3.2;

  const pfColor   = pf >= 0.90 ? "#38a169" : pf >= 0.85 ? "#d69e2e" : "#e53e3e";
  const voltColor = tension >= 380 && tension <= 440 ? "#38a169" : "#e53e3e";
  const thdColor  = thd <= 5 ? "#38a169" : "#e53e3e";

  const electricEnergies = energies.filter(e => e.name?.toLowerCase().includes("electric") && e.unit === "kW");
  const totalKw          = electricEnergies.reduce((s, e) => s + (e.value || 0), 0);

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Real-Time Monitoring</h1>
        
          Live electrical measurements +  predictions — {selectedLineLabel}
          <br />
         
      </div>

      {/* KPIs temps réel */}
      <section className="section-block">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">⚡</div>
            <div className="kpi-badge" style={{ background: voltColor }}>
              {tension >= 380 && tension <= 440 ? "Normal" : "⚠ Alert"}
            </div>
            <h3 style={{ color: voltColor }}>{tension.toFixed(1)} V</h3>
            <p>Voltage (Live)</p>
            <span>Range: 380–440 V · Nominal: 415 V</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon emerald">〰</div>
            <div className="kpi-badge green">
              {frequence >= 49 && frequence <= 51 ? "Stable" : "⚠ Alert"}
            </div>
            <h3>{frequence.toFixed(2)} Hz</h3>
            <p>Frequency (Live)</p>
            <span>Range: 49–51 Hz · Nominal: 50 Hz</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon purple">↗</div>
            <div className="kpi-badge" style={{ background: pfColor }}>
              {pf >= 0.90 ? "Good" : pf >= 0.85 ? "Acceptable" : "⚠ Low"}
            </div>
            <h3 style={{ color: pfColor }}>{pf.toFixed(3)}</h3>
            <p>Power Factor (Live)</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon orange">⚠</div>
            <div className="kpi-badge" style={{ background: thdColor }}>
              {thd <= 5 ? "Normal" : "⚠ High"}
            </div>
            <h3 style={{ color: thdColor }}>{thd.toFixed(2)} %</h3>
            <p>THD (Live)</p>
            <span>IEC 61000 limit: 5%</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon gold">⚡</div>
            <div className="kpi-badge red">Live</div>
            <h3>{totalKw > 0 ? `${totalKw.toFixed(1)} kW` : "—"}</h3>
            <p>Total Line Power</p>
            <span>Sum of all meters on line</span>
          </div>

          {predictions && predictions.voltage?.predictions?.[0] != null && (
            <div className="kpi-card">
              <div className="kpi-icon darkblue">🔮</div>
              <div className="kpi-badge" style={{ background: "#805ad5" }}>Prediction</div>
              <h3 style={{ fontSize: "1rem" }}>
                {predictions.voltage.predictions[0].toFixed(1)} V
              </h3>
              <p>Next Voltage Prediction</p>
              <span>
                Confidence: {predictions.voltage.confidence}%
                · Trend: {predictions.voltage.stats?.trend}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Graphes SVG avec données Python */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Live Trend Charts</h2>
          <p>
            {chartData
              ? `${chartData.data_points} historical points + ${chartData.voltage?.predictions?.length || 0} predicted points `
              : "Loading charts from backend Python..."}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
          <ChartCard
            title="Voltage History & Prediction"
            chartData={chartData?.voltage}
            loading={loadingCharts}
          />
          <ChartCard
            title="Power Factor History & Prediction"
            chartData={chartData?.power_factor}
            loading={loadingCharts}
          />
          <ChartCard
            title="Active Power History & Prediction"
            chartData={chartData?.active_power}
            loading={loadingCharts}
          />
          <ChartCard
            title="Frequency History & Prediction"
            chartData={chartData?.frequency}
            loading={loadingCharts}
          />
        </div>
      </section>

      {/* Statistiques prédictions Python */}
      {predictions && (
        <section className="section-block">
          <div className="section-title-wrap">
            <h2>Prediction Summary</h2>
            {/* CORRECTION: suppression de <Prediction> qui causait le crash */}
            <p>Prediction — next {predictions.horizon} data points</p>
          </div>
          <div className="carbon-kpis">
            {["voltage", "power_factor", "active_power"].map(key => {
              const p = predictions[key];
              if (!p) return null;
              return (
                <div className="carbon-card" key={key}>
                  <h4>
                    {p.unit === "V"  ? "⚡ Voltage"      :
                     p.unit === ""   ? "↗ Power Factor"  :
                                       "🔋 Active Power"}
                  </h4>
                  <strong>
                    {p.predictions?.[0]?.toFixed(p.unit === "" ? 3 : 1)} {p.unit}
                  </strong>
                  <span>Confidence: {p.confidence}% · Trend: {p.stats?.trend}</span>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.25rem", display: "block" }}>
                    Avg: {p.stats?.avg} · Std: {p.stats?.std} {p.unit}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tableau temps réel */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Live Measurements Table</h2>
          <p>Current values per energy type and equipment</p>
        </div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Equipment</th><th>Area</th><th>Energy Type</th>
                <th>Value</th><th>Unit</th><th>Voltage</th>
                <th>Power Factor</th><th>Frequency</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {energies.length > 0 ? (
                energies.map(e => (
                  <tr key={e.id}>
                    <td><strong>{e.rawData?.equipment || "—"}</strong></td>
                    <td>{e.rawData?.area || "—"}</td>
                    <td>{e.name}</td>
                    <td><strong>{e.value.toFixed(2)}</strong></td>
                    <td>{e.unit}</td>
                    <td>
                      {e.rawData?.voltage != null ? (
                        <span style={{ color: Number(e.rawData.voltage) >= 380 ? "#38a169" : "#e53e3e" }}>
                          {Number(e.rawData.voltage).toFixed(1)} V
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {e.rawData?.power_factor != null ? (
                        <span style={{ color: e.rawData.power_factor >= 0.9 ? "#38a169" : "#e53e3e" }}>
                          {Number(e.rawData.power_factor).toFixed(3)}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {e.rawData?.frequency != null
                        ? `${Number(e.rawData.frequency).toFixed(2)} Hz`
                        : "50.00 Hz"}
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "#888" }}>
                      {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" style={{ textAlign: "center", color: "#888" }}>
                    No data — make sure DataPlatform is running.
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