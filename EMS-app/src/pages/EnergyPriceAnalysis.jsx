import { useState, useMemo } from "react";
import { svgEventPoint, SvgHoverTooltip } from "../components/ChartTooltip.jsx";

// ─── Tarifs ONEE Maroc en MAD/kWh ────────────────────────────────────────────
const ONEE_TARIFFS = {
  peak:    { label: "Heures de Pointe", hours: [7, 8, 12, 13, 19, 20, 21],      rate: 1.628, color: "#e53e3e", bg: "#fff5f5", border: "#fed7d7" },
  full:    { label: "Heures Pleines",   hours: [9, 10, 11, 14, 15, 16, 17, 18], rate: 1.214, color: "#ed8936", bg: "#fffbeb", border: "#fbd38d" },
  offPeak: { label: "Heures Creuses",   hours: [0, 1, 2, 3, 4, 5, 6, 22, 23],   rate: 0.836, color: "#38a169", bg: "#f0fff4", border: "#c6f6d5" },
};

const CO2_FACTOR   = 0.718;
const HOURS_IN_DAY = Array.from({ length: 24 }, (_, i) => i);

function getTariffForHour(hour) {
  if (ONEE_TARIFFS.peak.hours.includes(hour))    return "peak";
  if (ONEE_TARIFFS.full.hours.includes(hour))    return "full";
  return "offPeak";
}

function formatHour(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

function HourlyCostChart({ hourlyData }) {
  const W    = 700;
  const H    = 180;
  const [hover, setHover] = useState(null);
  const maxV = Math.max(...hourlyData.map(d => d.cost), 0.001);
  const barW = (W - 40) / 24;

  // Étiquette au survol d'une barre : heure + coût + tranche tarifaire + kWh
  const handleMove = (evt) => {
    const { x } = svgEventPoint(evt, W, H);
    const i = Math.max(0, Math.min(23, Math.floor((x - 20) / barW)));
    const item = hourlyData[i];
    if (!item) return;
    const tariff = ONEE_TARIFFS[item.tariffKey];
    const barH = Math.max(3, (item.cost / maxV) * (H - 45));
    setHover({
      x: 20 + i * barW + barW / 2,
      y: H - 30 - barH,
      lines: [
        formatHour(i),
        `${item.cost.toFixed(2)} MAD`,
        `${(item.kwh ?? 0).toFixed(1)} kWh · ${tariff.rate} MAD/kWh`,
        tariff.label,
      ],
    });
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="none"
      onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
      {[0,1,2,3].map(i => (
        <line key={i} x1={20} y1={10 + i * (H-35)/3}
          x2={W-10} y2={10 + i * (H-35)/3}
          stroke="var(--border-color)" strokeWidth="1" strokeDasharray="4,4" />
      ))}
      {hourlyData.map((item, i) => {
        const tariff = ONEE_TARIFFS[item.tariffKey];
        const barH   = Math.max(3, (item.cost / maxV) * (H-45));
        const x      = 20 + i * barW + 2;
        const y      = H - 30 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW-4} height={barH}
              fill={tariff.color} rx="3"
              opacity={hover && hourlyData[i] && hover.lines[0] === formatHour(i) ? 1 : 0.85} />
            {i % 4 === 0 && (
              <text x={x + (barW-4)/2} y={H-14}
                textAnchor="middle" fontSize="9" fill="var(--text-secondary)">
                {formatHour(i)}
              </text>
            )}
          </g>
        );
      })}
      {hover && (
        <SvgHoverTooltip {...hover} W={W} H={H} color="#ed8936" guideTop={10} guideBottom={H - 30} />
      )}
      {Object.entries(ONEE_TARIFFS).map(([key, t], i) => (
        <g key={key}>
          <rect x={20 + i*160} y={H-6} width={10} height={6} fill={t.color} rx="2" />
          <text x={34 + i*160} y={H-1} fontSize="9" fill="var(--text-secondary)">{t.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function EnergyPriceAnalysis({
  energies          = [],
  selectedLineLabel = "Production Line 1",
  peakKw            = 0,
  cumulativeKwh     = 0,
}) {
  // Amorçage sur la VRAIE consommation cumulée (DataPlatform) ; l'utilisateur
  // peut ensuite ajuster pour simuler d'autres scénarios tarifaires.
  const [dailyKwh,    setDailyKwh]    = useState(
    () => (Number(cumulativeKwh) > 0 ? String(Math.round(Number(cumulativeKwh))) : "500")
  );
  const [selectedDay, setSelectedDay] = useState("weekday");

  // Profil de charge horaire TYPIQUE (industrie continue) — sert UNIQUEMENT à
  // répartir la consommation réelle sur 24 h pour la simulation tarifaire ONEE
  // (la DataPlatform ne fournit pas de découpage horaire sur 24 h). Ce n'est
  // pas une mesure : c'est une hypothèse de répartition, clairement affichée.
  const consumptionProfile = {
    weekday: [3, 2, 2, 2, 2, 3, 5, 7, 6, 6, 6, 6, 5, 5, 6, 6, 6, 5, 5, 6, 5, 4, 3, 2],
    weekend: [2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 7, 6, 6, 5, 5, 5, 5, 5, 5, 4, 3, 3, 2],
  };

  const totalKwh = parseFloat(dailyKwh) || 500;
  const profile  = consumptionProfile[selectedDay];
  const profileSum = profile.reduce((s, v) => s + v, 0);

  const hourlyData = useMemo(() => {
    return HOURS_IN_DAY.map(hour => {
      const pct       = profile[hour] / profileSum;
      const kwh       = totalKwh * pct;
      const tariffKey = getTariffForHour(hour);
      const rate      = ONEE_TARIFFS[tariffKey].rate;
      const cost      = kwh * rate;
      const co2       = kwh * CO2_FACTOR;
      return { hour, kwh, cost, co2, tariffKey, rate };
    });
  }, [totalKwh, selectedDay]);

  const tariffSummary = useMemo(() => {
    const summary = {
      peak:    { kwh: 0, cost: 0, hours: 0 },
      full:    { kwh: 0, cost: 0, hours: 0 },
      offPeak: { kwh: 0, cost: 0, hours: 0 },
    };
    hourlyData.forEach(d => {
      summary[d.tariffKey].kwh   += d.kwh;
      summary[d.tariffKey].cost  += d.cost;
      summary[d.tariffKey].hours += 1;
    });
    return summary;
  }, [hourlyData]);

  const totalCost     = hourlyData.reduce((s, d) => s + d.cost, 0);
  const totalCo2      = hourlyData.reduce((s, d) => s + d.co2,  0);
  const avgRate       = totalCost / (totalKwh || 1);
  const peakCost      = tariffSummary.peak.cost;
  const savingIfShift = peakCost * (1 - ONEE_TARIFFS.offPeak.rate / ONEE_TARIFFS.peak.rate);
  const bestHour      = hourlyData.reduce((min, d) => d.rate < min.rate ? d : min, hourlyData[0]);
  const worstHour     = hourlyData.reduce((max, d) => d.rate > max.rate ? d : max, hourlyData[0]);

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Energy Price Analysis</h1>
          <p className="page-subtitle">
            · {selectedLineLabel}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {["weekday", "weekend"].map(d => (
            <button key={d} type="button" onClick={() => setSelectedDay(d)}
              style={{
                padding: "0.45rem 1rem", borderRadius: "8px", cursor: "pointer",
                fontWeight: selectedDay === d ? 700 : 400, fontSize: "0.82rem",
                background: selectedDay === d ? "#2563eb" : "var(--bg-card)",
                color:      selectedDay === d ? "#fff"    : "var(--text-main)",
                border: "1px solid var(--border-color)",
              }}>
              {d === "weekday" ? "📅 Weekday" : "🏖️ Weekend"}
            </button>
          ))}
        </div>
      </div>

      {/* Données RÉELLES cumulées (DataPlatform) */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Real Consumption (live)</h2>
          <p>Actual cumulative {selectedLineLabel}</p>
        </div>
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>🔋 Total Energy Consumed</h4>
            <strong style={{ color:"#234e52", fontSize:"1.1rem" }}>{(Number(cumulativeKwh) || 0).toFixed(0)} kWh</strong>
            <span>Cumulative counter</span>
          </div>
          <div className="carbon-card">
            <h4>💰 Total Cost (cumulative)</h4>
            <strong style={{ color:"#744210", fontSize:"1.1rem" }}>{((Number(cumulativeKwh) || 0) * 1.40).toFixed(2)} MAD</strong>
            <span>Total consumed × 1.40</span>
          </div>
          <div className="carbon-card">
            <h4>🌱 Total CO₂ (cumulative)</h4>
            <strong style={{ color:"#38a169", fontSize:"1.1rem" }}>{((Number(cumulativeKwh) || 0) * 0.718).toFixed(2)} kg</strong>
            <span>Total consumed × 0.718</span>
          </div>
          {peakKw > 0 && (
            <div className="carbon-card">
              <h4>⚡ Peak Demand</h4>
              <strong style={{ color:"#ed8936", fontSize:"1.1rem" }}>{peakKw.toFixed(1)} kW</strong>
              <span>Live maximum</span>
            </div>
          )}
        </div>
      </section>

      {/* Input consommation */}
      <section className="section-block">
        <div className="panel-card">
          <div className="panel-head">
            <div><h2>Daily Consumption</h2><p>Enter your daily electricity consumption to calculate costs in MAD</p></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                Daily kWh consumption
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input type="number" min="1" step="10"
                  value={dailyKwh}
                  onChange={e => setDailyKwh(e.target.value)}
                  style={{
                    width: "140px", padding: "0.6rem 0.85rem",
                    borderRadius: "10px", border: "1.5px solid var(--border-color)",
                    background: "var(--bg-main)", color: "var(--text-main)",
                    fontSize: "1rem", fontWeight: 700, textAlign: "center", outline: "none",
                  }}
                  onFocus={e => e.target.style.borderColor = "#2563eb"}
                  onBlur={e  => e.target.style.borderColor = "var(--border-color)"}
                />
                <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>kWh/day</span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                Quick presets
              </label>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {[
                  { label: "Small", value: "200" },
                  { label: "Medium", value: "500" },
                  { label: "Large", value: "1000" },
                  { label: "Industrial", value: "5000" },
                ].map(preset => (
                  <button key={preset.value} type="button"
                    onClick={() => setDailyKwh(preset.value)}
                    style={{
                      padding: "0.45rem 0.75rem", borderRadius: "8px", cursor: "pointer",
                      fontSize: "0.78rem", fontWeight: 600,
                      background: dailyKwh === preset.value ? "#2563eb" : "var(--bg-main)",
                      color:      dailyKwh === preset.value ? "#fff"    : "var(--text-secondary)",
                      border: "1px solid var(--border-color)",
                    }}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {peakKw > 0 && (
              <div style={{ background: "#ebf8ff", border: "1px solid #bee3f8", borderRadius: "10px", padding: "0.6rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#2b6cb0", fontWeight: 700, marginBottom: "2px" }}></div>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#2b6cb0" }}>
                  Peak: {peakKw.toFixed(1)} kW
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* KPIs en MAD */}
      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>💰 Total Daily Cost</h4>
            <strong style={{ color: "#e53e3e", fontSize: "1.1rem" }}>{totalCost.toFixed(2)} MAD</strong>
            <span>For {totalKwh} kWh consumed</span>
          </div>
          <div className="carbon-card">
            <h4>📊 Average Rate</h4>
            <strong style={{ color: "#4299e1" }}>{avgRate.toFixed(4)} MAD/kWh</strong>
          </div>
          <div className="carbon-card">
            <h4>🌱 Daily CO₂</h4>
            <strong style={{ color: "#38a169" }}>{totalCo2.toFixed(2)} kg</strong>
            <span>× 0.718 kgCO₂/kWh </span>
          </div>
          <div className="carbon-card">
            <h4>💡 Savings Potential</h4>
            <strong style={{ color: "#276749" }}>{savingIfShift.toFixed(2)} MAD</strong>
          </div>
          <div className="carbon-card">
            <h4>⚡ Best Hour</h4>
            <strong style={{ color: "#38a169" }}>{formatHour(bestHour.hour)}</strong>
          </div>
          <div className="carbon-card">
            <h4>⚠️ Most Expensive</h4>
            <strong style={{ color: "#e53e3e" }}>{formatHour(worstHour.hour)}</strong>
          </div>
        </div>
      </section>

      {/* Grille tarifaire ONEE en MAD */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>ONEE Tariff Structure — Morocco</h2>
          <p>3 time-of-use periods — rates in MAD/kWh</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          {Object.entries(ONEE_TARIFFS).map(([key, t]) => {
            const s = tariffSummary[key];
            return (
              <div key={key} style={{
                background: t.bg, border: `1px solid ${t.border}`,
                borderRadius: "14px", padding: "1.5rem",
                borderLeft: `5px solid ${t.color}`,
              }}>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: t.color, marginBottom: "0.5rem" }}>
                  {t.label}
                </div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: t.color, marginBottom: "0.75rem" }}>
                  {t.rate} MAD/kWh
                </div>
                <div style={{ fontSize: "0.82rem", color: "#4a5568", marginBottom: "0.75rem" }}>
                  <strong>Hours ({t.hours.length}h):</strong>{" "}
                  {t.hours.map(h => formatHour(h)).join(", ")}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.82rem" }}>
                  <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: "8px", padding: "0.5rem", textAlign: "center" }}>
                    <div style={{ color: "#718096", fontSize: "0.7rem" }}>Consumption</div>
                    <div style={{ fontWeight: 700, color: t.color }}>{s.kwh.toFixed(1)} kWh</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: "8px", padding: "0.5rem", textAlign: "center" }}>
                    <div style={{ color: "#718096", fontSize: "0.7rem" }}>Cost</div>
                    <div style={{ fontWeight: 700, color: t.color }}>{s.cost.toFixed(2)} MAD</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Graphe horaire */}
      <section className="section-block">
        <div className="panel-card">
          <div className="panel-head">
            <div><h2>Hourly Cost Distribution</h2><p>Cost per hour — ONEE tariff — {selectedDay}</p></div>
            <div style={{ background: "#ebf8ff", color: "#2b6cb0", border: "1px solid #bee3f8", borderRadius: "8px", padding: "4px 12px", fontSize: "0.78rem", fontWeight: 700 }}>
              {totalKwh} kWh/day
            </div>
          </div>
          <HourlyCostChart hourlyData={hourlyData} />
        </div>
      </section>

      {/* Tableau horaire */}
      <section className="section-block">
        <div className="section-title-wrap"><h2>Detailed Hourly Breakdown</h2><p>All 24 hours with costs in MAD and CO₂</p></div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Hour</th>
                <th>Tariff Period</th>
                <th>Rate (MAD/kWh)</th>
                <th>Consumption (kWh)</th>
                <th>Cost (MAD)</th>
                <th>CO₂ (kg)</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {hourlyData.map(item => {
                const t = ONEE_TARIFFS[item.tariffKey];
                return (
                  <tr key={item.hour}>
                    <td><strong>{formatHour(item.hour)}</strong></td>
                    <td>
                      <span style={{
                        background: t.bg, color: t.color,
                        border: `1px solid ${t.border}`,
                        borderRadius: "6px", padding: "2px 8px",
                        fontSize: "0.75rem", fontWeight: 700,
                      }}>
                        {t.label}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: t.color }}>{t.rate}</td>
                    <td>{item.kwh.toFixed(2)}</td>
                    <td style={{ fontWeight: 700, color: "#d69e2e" }}>{item.cost.toFixed(2)}</td>
                    <td style={{ color: "#38a169" }}>{item.co2.toFixed(3)}</td>
                    <td style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      {item.tariffKey === "offPeak" ? "✅ Ideal for heavy loads" :
                       item.tariffKey === "peak"    ? "⚠️ Avoid if possible"     :
                                                      "🟡 Acceptable"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recommandations */}
      <section className="section-block">
        <div className="section-title-wrap"><h2>⚡ Optimization Recommendations</h2></div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            {
              icon: "🌙",
              title: "Shift heavy loads to off-peak hours (00h–06h, 22h–23h)",
              desc: `Save ${savingIfShift.toFixed(2)} MAD daily by running equipment at ${ONEE_TARIFFS.offPeak.rate} MAD/kWh instead of ${ONEE_TARIFFS.peak.rate} MAD/kWh.`,
              color: "#38a169", bg: "#f0fff4", border: "#c6f6d5",
            },
            {
              icon: "⏰",
              title: "Avoid 7h–9h and 19h–21h (peak hours)",
              desc: `Most expensive hours at ${ONEE_TARIFFS.peak.rate} MAD/kWh. Schedule non-urgent processes outside these windows.`,
              color: "#e53e3e", bg: "#fff5f5", border: "#fed7d7",
            },
            {
              icon: "📅",
              title: "Schedule maintenance during off-peak hours",
              desc: "Equipment testing performed at night reduces energy costs significantly.",
              color: "#4299e1", bg: "#ebf8ff", border: "#bee3f8",
            },
            {
              icon: "☀️",
              title: "Solar panels can reduce peak demand charges",
              desc: `Solar production (10h–16h) can offset ${ONEE_TARIFFS.full.rate}–${ONEE_TARIFFS.peak.rate} MAD/kWh rates. ROI typically 5–7 years in Morocco.`,
              color: "#d69e2e", bg: "#fffbeb", border: "#fbd38d",
            },
          ].map((rec, i) => (
            <div key={i} style={{
              background: rec.bg, border: `1px solid ${rec.border}`,
              borderLeft: `4px solid ${rec.color}`,
              borderRadius: "10px", padding: "1rem 1.25rem",
              display: "flex", gap: "1rem", alignItems: "flex-start",
            }}>
              <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>{rec.icon}</span>
              <div>
                <strong style={{ color: rec.color, fontSize: "0.92rem", display: "block", marginBottom: "0.25rem" }}>
                  {rec.title}
                </strong>
                <span style={{ fontSize: "0.84rem", color: "#4a5568" }}>{rec.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Projection annuelle en MAD */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Annual Cost Projection</h2>
          <p>Estimated yearly costs — {totalKwh} kWh/day — in MAD</p>
        </div>
        <div className="carbon-kpis">
          {[
            { label: "Daily Cost",    value: `${totalCost.toFixed(2)} MAD`,                  sub: `${totalKwh} kWh/day` },
            { label: "Weekly Cost",   value: `${(totalCost * 7).toFixed(2)} MAD`,            sub: `${(totalKwh * 7).toFixed(0)} kWh/week` },
            { label: "Monthly Cost",  value: `${(totalCost * 30).toFixed(2)} MAD`,           sub: `${(totalKwh * 30).toFixed(0)} kWh/month` },
            { label: "Annual Cost",   value: `${(totalCost * 365).toFixed(2)} MAD`,          sub: `${(totalKwh * 365).toFixed(0)} kWh/year` },
            { label: "Annual CO₂",    value: `${(totalCo2 * 365 / 1000).toFixed(3)} tCO₂`,  sub: "tonnes CO₂/year" },
            { label: "Annual Saving", value: `${(savingIfShift * 365).toFixed(2)} MAD`,      sub: "If peak loads shifted", color: "#38a169" },
          ].map(item => (
            <div key={item.label} className="carbon-card">
              <h4>{item.label}</h4>
              <strong style={{ color: item.color || "var(--text-main)" }}>{item.value}</strong>
              <span>{item.sub}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}