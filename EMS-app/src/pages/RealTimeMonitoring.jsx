import { useEffect, useState } from "react";
import { getCached, setCached } from "../utils/pageCache.js";
import { fetchChartData } from "../api/emsApi";
import { svgEventPoint, nearestIndex, SvgHoverTooltip } from "../components/ChartTooltip.jsx";

function LiveChart({ chartData, height = 200 }) {
  const [hover, setHover] = useState(null);
  if (!chartData) return (
    <div style={{ height, display:"flex", alignItems:"center",
      justifyContent:"center", color:"#888", fontSize:"0.85rem" }}>
      Waiting for data...
    </div>
  );

  const { values = [], nominal, min_alarm, max_alarm, unit, color = "#4299e1" } = chartData;

  if (values.length < 2) return (
    <div style={{ height, display:"flex", alignItems:"center",
      justifyContent:"center", color:"#888", fontSize:"0.85rem" }}>
      Collecting data... ({values.length} point{values.length !== 1 ? "s" : ""})
    </div>
  );

  const W = 700, H = height, PX = 45, PY = 20;
  const minV = Math.min(...values) * 0.98;
  const maxV = Math.max(...values) * 1.02 || 1;
  const rng  = maxV - minV || 1;

  const toX = (i) => PX + (i * (W - PX - 10)) / Math.max(values.length - 1, 1);
  const toY = (v)  => PY + (1 - (v - minV) / rng) * (H - PY - 25);

  const histPoints = values
    .map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(" ");

  const nominalY  = nominal   != null ? toY(nominal)   : null;
  const minAlarmY = min_alarm != null ? toY(min_alarm)  : null;
  const maxAlarmY = max_alarm != null ? toY(max_alarm)  : null;

  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const v = minV + (rng * i) / 4;
    return { v: v.toFixed(unit === "" ? 3 : 1), y: toY(v) };
  });

  // Étiquette au survol : heure exacte + valeur mesurée du point
  const timestamps = chartData.timestamps || [];
  const handleMove = (evt) => {
    const { x } = svgEventPoint(evt, W, H);
    const i = nearestIndex(x, PX, W - PX - 10, values.length);
    const when = timestamps[i]
      ? new Date(timestamps[i]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : `Point ${i + 1}/${values.length}`;
    setHover({
      x: toX(i),
      y: toY(values[i]),
      lines: [when, `${Number(values[i]).toFixed(unit === "" ? 3 : 2)} ${unit}`.trim()],
    });
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:H, overflow:"visible" }}
      preserveAspectRatio="none"
      onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>

      {yLabels.map((l, i) => (
        <g key={i}>
          <line x1={PX} y1={l.y} x2={W-10} y2={l.y}
            stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
          <text x={PX-5} y={l.y+4} textAnchor="end" fontSize="10" fill="#94a3b8">
            {l.v}
          </text>
        </g>
      ))}

      {maxAlarmY != null && maxAlarmY >= PY && (
        <line x1={PX} y1={maxAlarmY} x2={W-10} y2={maxAlarmY}
          stroke="#e53e3e" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
      )}
      {minAlarmY != null && minAlarmY <= H-25 && (
        <line x1={PX} y1={minAlarmY} x2={W-10} y2={minAlarmY}
          stroke="#ed8936" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
      )}
      {nominalY != null && (
        <line x1={PX} y1={nominalY} x2={W-10} y2={nominalY}
          stroke="#ecc94b" strokeWidth="1" strokeDasharray="8,4" opacity="0.8" />
      )}

      <defs>
        <linearGradient id={`grad-${unit}-rt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      <polygon
        points={`${PX},${H-25} ${histPoints} ${toX(values.length-1).toFixed(1)},${H-25}`}
        fill={`url(#grad-${unit}-rt)`}
      />
      <polyline fill="none" stroke={color} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" points={histPoints} />

      {values.slice(-5).map((v, i) => {
        const idx = values.length - 5 + i;
        return (
          <circle key={i} cx={toX(idx)} cy={toY(v)}
            r="3.5" fill={color} stroke="white" strokeWidth="1.5">
            <title>{`${chartData.label || "Value"} — Point ${idx + 1}: ${Number(v).toFixed(unit === "" ? 3 : 2)} ${unit}`}</title>
          </circle>
        );
      })}

      <text x={PX} y={H-8} fontSize="10" fill="#94a3b8">oldest</text>
      <text x={W-10} y={H-8} fontSize="10" fill="#94a3b8" textAnchor="end">now</text>
      {hover && (
        <SvgHoverTooltip {...hover} W={W} H={H} color={color} guideTop={PY} guideBottom={H - 25} />
      )}
    </svg>
  );
}

function ChartCard({ title, chartData, loading }) {
  if (!chartData && !loading) return null;
  const stats     = chartData?.stats;
  const trendIcon = { increasing:"↗", decreasing:"↘", stable:"→" }[stats?.trend] || "→";
  const trendColor= { increasing:"#e53e3e", decreasing:"#38a169", stable:"#888" }[stats?.trend] || "#888";
  const unit      = chartData?.unit || "";

  return (
    <div className="panel-card" style={{ padding:"1.25rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:"0.75rem" }}>
        <div>
          <h3 style={{ margin:0, fontSize:"1rem", fontWeight:600 }}>{title}</h3>
          {stats && !loading && (
            <p style={{ margin:"0.25rem 0 0", fontSize:"0.82rem", color:"#64748b" }}>
              Avg: <strong>{stats.avg}{unit}</strong> · Min: {stats.min}{unit} · Max: {stats.max}{unit}
              <span style={{ color:trendColor, marginLeft:"0.5rem", fontWeight:600 }}>
                {trendIcon} {stats.trend}
              </span>
            </p>
          )}
        </div>
        <div style={{ display:"flex", gap:"0.5rem", alignItems:"center" }}>
          {!loading && (
            <span style={{ fontSize:"0.7rem", background:"#dcfce7", color:"#16a34a",
              padding:"2px 8px", borderRadius:"10px", fontWeight:600 }}>
              ● Live
            </span>
          )}
          {loading && <span style={{ fontSize:"0.75rem", color:"#94a3b8" }}>Loading...</span>}
        </div>
      </div>

      {chartData?.values?.length > 0 && !loading && (
        <div style={{ marginBottom:"0.5rem" }}>
          <span style={{ fontSize:"1.8rem", fontWeight:700, color:chartData.color || "#333" }}>
            {chartData.values[chartData.values.length-1].toFixed(unit === "" ? 3 : 1)}
          </span>
          <span style={{ fontSize:"0.9rem", color:"#94a3b8", marginLeft:"0.3rem" }}>{unit}</span>
        </div>
      )}

      <div style={{ display:"flex", gap:"1rem", fontSize:"0.72rem",
        color:"#94a3b8", marginBottom:"0.5rem" }}>
        {chartData?.nominal   != null && <span style={{ color:"#b7791f" }}>— Nominal: {chartData.nominal}{unit}</span>}
        {chartData?.min_alarm != null && <span style={{ color:"#ed8936" }}>— Min alarm: {chartData.min_alarm}{unit}</span>}
        {chartData?.max_alarm != null && <span style={{ color:"#e53e3e" }}>— Max alarm: {chartData.max_alarm}{unit}</span>}
      </div>

      <LiveChart chartData={chartData} height={180} />
    </div>
  );
}

export default function RealTimeMonitoring({
  data                = {},
  powerQualityHistory = [],
  energies            = [],
  selectedLineLabel   = "Production Line 1",
}) {
  const [chartData,     setChartData]     = useState(() => getCached("rtm_chart", null));
  useEffect(() => { setCached("rtm_chart", chartData); }, [chartData]);
  const [loadingCharts, setLoadingCharts] = useState(() => !getCached("rtm_chart", null));

  useEffect(() => {
    const load = async () => {
      setLoadingCharts(true);
      try {
        const charts = await fetchChartData(selectedLineLabel, 30);
        setChartData(charts);
      } catch {}
      finally { setLoadingCharts(false); }
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [selectedLineLabel]);

  const tension   = data.tension          ?? 230;
  const frequence = data.frequence        ?? 50;
  const pf        = data.facteurPuissance ?? 0.90;
  const thd       = data.thd             ?? 3.2;

  const pfColor   = pf >= 0.90 ? "#38a169" : pf >= 0.85 ? "#d69e2e" : "#e53e3e";
  const voltColor = tension >= 210 && tension <= 250 ? "#38a169" : "#e53e3e";
  const thdColor  = thd <= 5 ? "#38a169" : "#e53e3e";
  const freqColor = frequence >= 49.5 && frequence <= 50.5 ? "#38a169" : "#e53e3e";

  const electricEnergies = energies.filter(e =>
    e.name?.toLowerCase().includes("electric") && e.unit === "kW"
  );
  const totalKw = electricEnergies.reduce((s, e) => s + (e.value || 0), 0);

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Real-Time Monitoring</h1>
        <p>Live electrical measurements — {selectedLineLabel}</p>
      </div>

      {/* KPIs live */}
      <section className="section-block">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">⚡</div>
            <div className="kpi-badge" style={{ background:voltColor }}>
              {tension >= 210 && tension <= 250 ? "Normal" : "⚠ Alert"}
            </div>
            <h3 style={{ color:voltColor }}>{tension.toFixed(1)} V</h3>
            <p>Voltage (Live)</p>
            <span>Range: 210–250 V · Nominal: 230 V</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon emerald">〰</div>
            <div className="kpi-badge" style={{ background:freqColor }}>
              {frequence >= 49.5 && frequence <= 50.5 ? "Stable" : "⚠ Alert"}
            </div>
            <h3 style={{ color:freqColor }}>{frequence.toFixed(2)} Hz</h3>
            <p>Frequency (Live)</p>
            <span>Range: 49.5–50.5 Hz · Nominal: 50 Hz</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon purple">↗</div>
            <div className="kpi-badge" style={{ background:pfColor }}>
              {pf >= 0.90 ? "Good" : pf >= 0.85 ? "Acceptable" : "⚠ Low"}
            </div>
            <h3 style={{ color:pfColor }}>{pf.toFixed(3)}</h3>
            <p>Power Factor (Live)</p>
            <span>Target: ≥ 0.90 · Alarm: &lt; 0.80</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon orange">⚠</div>
            <div className="kpi-badge" style={{ background:thdColor }}>
              {thd <= 5 ? "Normal" : "⚠ High"}
            </div>
            <h3 style={{ color:thdColor }}>{thd.toFixed(2)} %</h3>
            <p>THD Voltage (Live)</p>
            <span>IEC 61000 limit: 5%</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon gold">⚡</div>
            <div className="kpi-badge red">Live</div>
            <h3>{totalKw > 0 ? `${totalKw.toFixed(1)} kW` : "—"}</h3>
            <p>Total Line Power</p>
            <span>Sum of all meters on line</span>
          </div>
        </div>
      </section>

      {/* Graphes live */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Live Trend Charts</h2>
          <p>
            {chartData
              ? `${chartData.data_points} historical points — live data`
              : "Loading charts..."}
          </p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.25rem" }}>
          <ChartCard title="Voltage"       chartData={chartData?.voltage}      loading={loadingCharts} />
          <ChartCard title="Power Factor"  chartData={chartData?.power_factor} loading={loadingCharts} />
          <ChartCard title="Active Power"  chartData={chartData?.active_power} loading={loadingCharts} />
          <ChartCard title="Frequency"     chartData={chartData?.frequency}    loading={loadingCharts} />
        </div>
      </section>

      {/* Tableau live */}
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
                <th>Power Factor</th><th>Frequency</th><th>THD</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {energies.length > 0 ? energies.map(e => (
                <tr key={e.id}>
                  <td><strong>{e.rawData?.equipment || "—"}</strong></td>
                  <td>{e.rawData?.area || "—"}</td>
                  <td>{e.name}</td>
                  <td><strong>{e.value.toFixed(2)}</strong></td>
                  <td>{e.unit}</td>
                  <td>
                    {e.rawData?.voltage != null ? (
                      <span style={{ color: Number(e.rawData.voltage) >= 210 && Number(e.rawData.voltage) <= 250 ? "#38a169" : "#e53e3e" }}>
                        {Number(e.rawData.voltage).toFixed(1)} V
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    {e.rawData?.power_factor != null ? (
                      <span style={{ color: e.rawData.power_factor >= 0.90 ? "#38a169" : "#e53e3e" }}>
                        {Number(e.rawData.power_factor).toFixed(3)}
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    {e.rawData?.frequency != null
                      ? `${Number(e.rawData.frequency).toFixed(2)} Hz`
                      : "50.00 Hz"}
                  </td>
                  <td>
                    {e.rawData?.thd != null ? (
                      <span style={{ color: Number(e.rawData.thd) <= 5 ? "#38a169" : "#e53e3e" }}>
                        {Number(e.rawData.thd).toFixed(1)} %
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ fontSize:"0.8rem", color:"#888" }}>
                    {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—"}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="10" style={{ textAlign:"center", color:"#888" }}>
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