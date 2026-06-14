import TagFilter from "../components/TagFilter.jsx";

const toMAD = (mad) => `${Number(mad || 0).toFixed(2)} MAD`;

const isCO2 = (name = "") => {
  const n = (name || "").toLowerCase();
  return (
    n.includes("co2") ||
    n.includes("co₂") ||
    n.includes("carbon") ||
    n.includes("emission")
  );
};

const isCumulative = (e) => {
  const n = (e?.name || "").toLowerCase();
  return n.includes("kwh") || e?.unit === "kWh";
};

function SECCalculator({ selectedLineLabel, totalCo2Kg, cumulativeKwh }) {
  const totalKwh = Number(cumulativeKwh || 0);
  const co2Kg = Number(totalCo2Kg || 0);
  const co2Tonnes = co2Kg / 1000;
  const sec = co2Tonnes > 0 && totalKwh > 0 ? totalKwh / co2Tonnes : null;

  const secColor = !sec
    ? "#4299e1"
    : sec < 500
    ? "#38a169"
    : sec < 1000
    ? "#d69e2e"
    : "#e53e3e";

  return (
    <div className="panel-card">
      <div className="panel-head">
        <div>
          <h2>⚡ SEC — Specific Energy Consumption</h2>
          <p>Auto-calculated  · {selectedLineLabel}</p>
        </div>

        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            background: "#dcfce7",
            color: "#16a34a",
            border: "1px solid #bbf7d0",
            borderRadius: "8px",
            padding: "4px 12px",
          }}
        >
          ● Auto Live
        </span>
      </div>

      <div className="carbon-kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="carbon-card">
          <h4>Total kWh</h4>
          <strong style={{ color: "#4299e1" }}>
            {totalKwh > 0 ? `${totalKwh.toFixed(2)} kWh` : "—"}
          </strong>
          <span>Cumulative energy</span>
        </div>

        <div className="carbon-card">
          <h4>CO₂ Production</h4>
          <strong style={{ color: "#ed8936" }}>
            {co2Tonnes > 0 ? `${co2Tonnes.toFixed(4)} t` : "—"}
          </strong>
          <span>{co2Kg > 0 ? `${co2Kg.toFixed(2)} kg` : "Waiting DataPlatform..."}</span>
        </div>

        <div className="carbon-card">
          <h4>SEC</h4>
          <strong style={{ color: secColor, fontSize: "1.3rem" }}>
            {sec !== null ? sec.toFixed(1) : "—"}
          </strong>
          <span>kWh / tCO₂</span>
        </div>
      </div>

      {sec !== null && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem 1rem",
            background: sec < 500 ? "#f0fff4" : sec < 1000 ? "#fffbeb" : "#fff5f5",
            border: `1px solid ${
              sec < 500 ? "#c6f6d5" : sec < 1000 ? "#fbd38d" : "#fed7d7"
            }`,
            borderRadius: "8px",
            fontSize: "0.83rem",
            color: secColor,
            fontWeight: 600,
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "1.1rem" }}>
            {sec < 500 ? "✅" : sec < 1000 ? "⚠️" : "🔴"}
          </span>

          <div>
            <span>
              {sec < 500
                ? "Excellent efficiency (< 500 kWh/tCO₂)"
                : sec < 1000
                ? "Acceptable — room for improvement"
                : "Low efficiency — action required"}
            </span>

            <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "2px" }}>
              {totalKwh.toFixed(2)} kWh ÷ {co2Tonnes.toFixed(4)} tCO₂ ={" "}
              <strong style={{ color: secColor }}>{sec.toFixed(2)} kWh/t</strong>
            </div>
          </div>
        </div>
      )}

      {sec === null && (
        <div className="info-box" style={{ marginTop: "0.75rem" }}>
          ⏳ Waiting for <strong>kWh</strong> and <strong>CO₂</strong> data from DataPlatform.
        </div>
      )}
    </div>
  );
}

function MultiLineComparison({ backendSummary }) {
  const lines = Object.entries(backendSummary || {});
  if (lines.length === 0) return null;

  return (
    <section className="section-block">
      <div className="section-title-wrap">
        <h2>All Lines Quick Comparison</h2>
        <p>{lines.length} production line(s)</p>
      </div>

      <div className="comparison-grid">
        {lines.map(([lineName, lineData]) => {
          const energies = lineData.energies || [];

          const totalKw = energies
            .filter((e) => e.unit === "kW")
            .reduce((s, e) => s + Number(e.value || 0), 0);

          const pf = lineData.avg_power_factor;
          const voltage = lineData.avg_voltage;
          const co2 = lineData.total_co2_kg || 0;
          const cost = lineData.total_cost || 0;
          const peak = lineData.peak_kw || 0;

          const isActive = totalKw > 0;
          const pfColor = pf ? (pf >= 0.9 ? "#38a169" : "#e53e3e") : "#888";
          const vColor = voltage
            ? Number(voltage) >= 210 && Number(voltage) <= 250
              ? "#38a169"
              : "#e53e3e"
            : "#888";

          const kwhE = energies.find((e) => e.unit === "kWh");
          const lineKwh = kwhE ? Number(kwhE.value || 0) : 0;
          const lineSEC = co2 > 0 && lineKwh > 0 ? (lineKwh / (co2 / 1000)).toFixed(0) : null;

          const secColor = lineSEC
            ? Number(lineSEC) < 500
              ? "#38a169"
              : Number(lineSEC) < 1000
              ? "#d69e2e"
              : "#e53e3e"
            : "#888";

          return (
            <div
              key={lineName}
              className="comparison-line-card"
              style={{
                borderTop: `3px solid ${isActive ? "#4299e1" : "#e2e8f0"}`,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  color: "var(--text-main)",
                  marginBottom: "0.5rem",
                }}
              >
                {lineName.replace("Production Line ", "Line ")}

                <span
                  style={{
                    marginLeft: "0.5rem",
                    fontSize: "0.7rem",
                    color: isActive ? "#38a169" : "#94a3b8",
                  }}
                >
                  {isActive ? "● Active" : "○ Idle"}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.3rem",
                  fontSize: "0.78rem",
                }}
              >
                {[
                  { label: "POWER", value: `${totalKw.toFixed(1)} kW`, color: "#4299e1" },
                  { label: "PEAK", value: `${Number(peak).toFixed(1)} kW`, color: "#ed8936" },
                  { label: "PF", value: pf ? Number(pf).toFixed(3) : "—", color: pfColor },
                  {
                    label: "VOLTAGE",
                    value: voltage ? `${Number(voltage).toFixed(0)}V` : "—",
                    color: vColor,
                  },
                  { label: "CO₂", value: `${Number(co2).toFixed(2)} kg`, color: "#38a169" },
                  { label: "COST", value: toMAD(cost), color: "#d69e2e" },
                  { label: "kWh", value: lineKwh > 0 ? `${lineKwh.toFixed(1)}` : "—", color: "#7c3aed" },
                  { label: "SEC", value: lineSEC ? `${lineSEC} kWh/t` : "—", color: secColor },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      textAlign: "center",
                      background: "var(--bg-main)",
                      borderRadius: "6px",
                      padding: "0.35rem 0.2rem",
                    }}
                  >
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.62rem" }}>
                      {item.label}
                    </div>

                    <div
                      style={{
                        fontWeight: 700,
                        color: item.color,
                        fontSize: "0.77rem",
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function findEnergy(energies, keywords) {
  return energies.find((e) =>
    keywords.some((k) => e.name.toLowerCase().includes(k.toLowerCase()))
  );
}

export default function Dashboard({
  energies = [],
  selectedLineLabel = "Production Line 1",
  totalCost = 0,
  peakKw = 0,
  totalCo2 = 0,
  cumulativeKwh = 0,
  avgVoltage = null,
  avgPowerFactor = null,
  backendSummary = {},
  availableTags = [],
  selectedTag = "",
  onTagSelect,
}) {
  const electricity = findEnergy(energies, ["electric", "électric"]);

  const totalKw = energies
    .filter((e) => e.unit === "kW")
    .reduce((s, e) => s + Number(e.value || 0), 0);

  const co2Display = totalCo2 > 0 ? totalCo2 : cumulativeKwh > 0 ? cumulativeKwh * 0.718 : 0;

  const MAX_KW = 300;
  const METER_MAX_KW = 10;
  const RUNNING_THRESHOLD = 1;
  const STANDBY_THRESHOLD = 0.1;

  const realCost = energies
    .filter((e) => !isCO2(e.name))
    .reduce((s, e) => s + Number(e.cost || 0), 0);

  const displayCost = totalCost > 0 ? totalCost : realCost;

  const consumed = energies.filter((e) => !isCO2(e.name) && !isCumulative(e));

  const allEquipments = [];

  Object.entries(backendSummary || {}).forEach(([lineName, lineData]) => {
    if (!lineData?.energies) return;

    const eqMap = {};

    lineData.energies.forEach((e) => {
      if (!e.equipment) return;

      if (!eqMap[e.equipment]) {
        eqMap[e.equipment] = {
          name: e.equipment,
          area: e.area,
          unit_name: e.unit_name,
          plant: e.plant,
          line: lineName,
          kw: null,
          kwh: null,
          voltage: e.voltage,
          power_factor: e.power_factor,
        };
      }

      if (e.unit === "kW") {
        eqMap[e.equipment].kw = Number(e.value || 0);

        if (e.voltage) eqMap[e.equipment].voltage = e.voltage;
        if (e.power_factor) eqMap[e.equipment].power_factor = e.power_factor;
      }

      if (e.unit === "kWh") {
        eqMap[e.equipment].kwh = Number(e.value || 0);
      }
    });

    Object.values(eqMap).forEach((eq) => allEquipments.push(eq));
  });

  const lineEquipments = allEquipments.filter((eq) => eq.line === selectedLineLabel);
  const displayEquipments = lineEquipments.length > 0 ? lineEquipments : allEquipments.slice(0, 8);

  const getStatus = (kw) =>
    kw == null
      ? { label: "Unknown", cls: "", color: "#888" }
      : kw > RUNNING_THRESHOLD
      ? { label: "Running", cls: "running", color: "#38a169" }
      : kw > STANDBY_THRESHOLD
      ? { label: "Standby", cls: "", color: "#d69e2e" }
      : { label: "Off", cls: "", color: "#e53e3e" };

  const getLoad = (kw) => (kw != null ? Math.min(100, Math.round((kw / METER_MAX_KW) * 100)) : 0);

  const getLoadColor = (load) => (load > 90 ? "red" : load > 70 ? "yellow" : "green");

  const pfColor = avgPowerFactor != null ? (avgPowerFactor >= 0.9 ? "#38a169" : "#e53e3e") : "#888";

  const voltColor =
    avgVoltage != null ? (avgVoltage >= 210 && avgVoltage <= 250 ? "#38a169" : "#e53e3e") : "#888";

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Dashboard Overview</h1>
          <p className="page-subtitle">
            {selectedLineLabel}
            {selectedTag ? ` — #${selectedTag}` : ""}
          </p>
        </div>

        <span className="live-label" style={{ fontSize: "0.9rem" }}>
          ● Live
        </span>
      </div>

      <TagFilter
        availableTags={availableTags}
        selectedTag={selectedTag}
        onTagSelect={onTagSelect}
      />

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Critical KPIs</h2>
          <p>Real-time metrics — {selectedLineLabel}</p>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">⚡</div>
            <div className="kpi-badge red">Live</div>
            <h3>
              {totalKw > 0
                ? `${totalKw.toFixed(1)} kW`
                : electricity
                ? `${electricity.value.toFixed(1)} kW`
                : "—"}
            </h3>
            <p>Total Active Power</p>
            <span>Sum of all meters on {selectedLineLabel}</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon orange">〰</div>
            <div className="kpi-badge amber">Live</div>
            <h3>{peakKw > 0 ? `${Number(peakKw).toFixed(1)} kW` : "—"}</h3>
            <p>Peak Demand</p>
            <span>Maximum recorded</span>

            {peakKw > 0 && (
              <div className="progress-line yellow">
                <div
                  style={{
                    width: `${Math.min(100, (peakKw / MAX_KW) * 100).toFixed(0)}%`,
                    transition: "width 0.5s",
                  }}
                />
              </div>
            )}
          </div>

          <div className="kpi-card">
            <div className="kpi-icon green">↗</div>
            <div className="kpi-badge" style={{ background: pfColor }}>
              Live
            </div>

            <h3 style={{ color: pfColor }}>
              {avgPowerFactor != null
                ? Number(avgPowerFactor).toFixed(3)
                : electricity?.rawData?.power_factor != null
                ? Number(electricity.rawData.power_factor).toFixed(3)
                : "—"}
            </h3>

            <p>Power Factor</p>
            <span>
              {avgPowerFactor != null
                ? avgPowerFactor >= 0.9
                  ? "Good ✓ (≥0.90)"
                  : "Low ⚠ (<0.90)"
                : "Waiting..."}
            </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon blue">🔌</div>
            <div className="kpi-badge" style={{ background: voltColor }}>
              Live
            </div>

            <h3 style={{ color: voltColor }}>
              {avgVoltage != null
                ? `${Number(avgVoltage).toFixed(1)} V`
                : electricity?.rawData?.voltage != null
                ? `${Number(electricity.rawData.voltage).toFixed(1)} V`
                : "—"}
            </h3>

            <p>Voltage</p>
            <span>Average · Nominal 230V</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon leaf">🌱</div>
            <div className="kpi-badge green">Live</div>
            <h3>{co2Display > 0 ? `${co2Display.toFixed(3)} kg` : "—"}</h3>
            <p>CO₂ Emissions</p>
            <span>kWh × 0.718 kgCO₂/kWh </span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon darkblue">⚙</div>
            <div className="kpi-badge red">Live</div>
            <h3>
              {displayEquipments.length > 0
                ? `${displayEquipments.filter((eq) => (eq.kw || 0) > RUNNING_THRESHOLD).length}/${
                    displayEquipments.length
                  }`
                : "—"}
            </h3>
            <p>Active Equipment</p>
            <span>Running / Total Meters</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon gold">💰</div>
            <div className="kpi-badge red">Live</div>
            <h3>{toMAD(displayCost)}</h3>
            <p>Current Operating Cost</p>
            <span>Active power × 1.40 MAD/kWh</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon emerald">🔋</div>
            <div className="kpi-badge green">Live</div>
            <h3>{cumulativeKwh > 0 ? `${Number(cumulativeKwh).toFixed(1)} kWh` : "—"}</h3>
            <p>Cumulative Energy</p>
            <span>Total energy counter (kWh)</span>
          </div>
        </div>
      </section>

      <MultiLineComparison backendSummary={backendSummary} />

      <section className="section-block">
        <SECCalculator
          selectedLineLabel={selectedLineLabel}
          totalCo2Kg={co2Display}
          cumulativeKwh={cumulativeKwh}
        />
      </section>

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Equipment Monitoring</h2>
          <p>
            Real meters on {selectedLineLabel}
            {displayEquipments.length === 0 && " — Waiting for DataPlatform..."}
          </p>
        </div>

        <div className="equipment-grid">
          {displayEquipments.length > 0 ? (
            displayEquipments.map((eq) => {
              const status = getStatus(eq.kw);
              const load = getLoad(eq.kw);

              return (
                <div className="equipment-card" key={`${eq.line}-${eq.name}`}>
                  <div className="equipment-top">
                    <div>
                      <small>{eq.area || eq.line}</small>
                      <h4>{eq.name}</h4>
                    </div>

                    <span className={`status ${status.cls}`} style={{ color: status.color }}>
                      {status.label}
                    </span>
                  </div>

                  <div className="equipment-meta">
                    ⚡ {eq.kw != null ? `${eq.kw.toFixed(1)} kW` : "—"}
                    {eq.voltage != null && ` · ${Number(eq.voltage).toFixed(0)} V`}
                    {eq.power_factor != null && ` · PF ${Number(eq.power_factor).toFixed(2)}`}
                  </div>

                  <div className="equipment-load-row">
                    <span>Load</span>
                    <strong>{load}%</strong>
                  </div>

                  <div className={`progress-line ${getLoadColor(load)}`}>
                    <div style={{ width: `${load}%`, transition: "width 0.5s" }} />
                  </div>

                  <div className="equipment-footer">
                    {eq.unit_name || "—"} · {eq.plant || "Plant 1"}
                    {eq.kwh != null && ` · ${eq.kwh.toFixed(1)} kWh`}
                  </div>
                </div>
              );
            })
          ) : (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "2rem",
                color: "#888",
              }}
            >
              Waiting for DataPlatform data...
            </div>
          )}
        </div>
      </section>

      <div className="two-column-layout">
        <section className="panel-card">
          <div className="panel-head">
            <div>
              <h2>Energy Performance</h2>
              <p>Live from {selectedLineLabel}</p>
            </div>
            <span className="live-label">● Live</span>
          </div>

          <div className="zone-bars">
            {consumed.length > 0 ? (
              consumed.slice(0, 5).map((energy, i) => (
                <div
                  key={energy.id}
                  className={`bar ${["purple", "blue", "green", "orange", "gray"][i % 5]}`}
                  style={{
                    height: `${Math.min(90, Math.max(10, (energy.value / (energy.max || 500)) * 100))}%`,
                  }}
                  title={`${energy.name} — ${energy.value.toFixed(2)} ${energy.unit}`}
                />
              ))
            ) : (
              <p style={{ color: "#888", padding: "1rem" }}>Waiting for DataPlatform data...</p>
            )}
          </div>

          <div className="zone-labels">
            {consumed.slice(0, 5).map((e) => (
              <span key={e.id}>{e.name.length > 12 ? e.name.slice(0, 10) + "…" : e.name}</span>
            ))}
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-head">
            <div>
              <h2>Cost by Energy Type</h2>
            </div>
          </div>

          <div className="carbon-kpis">
            {consumed.length > 0 ? (
              consumed.map((e) => (
                <div className="carbon-card" key={e.id}>
                  <h4>{e.name}</h4>
                  <strong style={{ color: "#d69e2e" }}>{toMAD(e.cost || 0)}</strong>
                  <span>
                    {e.value.toFixed(2)} {e.unit}
                  </span>
                </div>
              ))
            ) : (
              <div className="carbon-card">
                <h4>No data</h4>
                <strong>—</strong>
                <span>Waiting for DataPlatform</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Detailed Energy Data</h2>
          <p>All measurements for {selectedLineLabel}</p>
        </div>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Area</th>
                <th>Energy Type</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Voltage</th>
                <th>Power Factor</th>
                <th>Cost (MAD)</th>
                <th>CO₂ (kg)</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>

            <tbody>
              {energies.length > 0 ? (
                energies.map((e) => {
                  const ratio = (e.value / (e.max || 500)) * 100;
                  const status = ratio >= 85 ? "High" : ratio <= 10 ? "Low" : "Normal";
                  const sc = { High: "#e53e3e", Low: "#888", Normal: "#38a169" }[status];

                  return (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.rawData?.equipment || "—"}</strong>
                      </td>
                      <td>{e.rawData?.area || "—"}</td>
                      <td>{e.name}</td>
                      <td>
                        <strong>{e.value.toFixed(2)}</strong>
                      </td>
                      <td>{e.unit}</td>
                      <td>
                        {e.rawData?.voltage != null ? (
                          <span
                            style={{
                              color: Number(e.rawData.voltage) >= 210 ? "#38a169" : "#e53e3e",
                            }}
                          >
                            {Number(e.rawData.voltage).toFixed(1)} V
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {e.rawData?.power_factor != null
                          ? Number(e.rawData.power_factor).toFixed(3)
                          : "—"}
                      </td>
                      <td
                        style={{
                          color: isCO2(e.name) ? "#94a3b8" : "#d69e2e",
                          fontWeight: 600,
                        }}
                      >
                        {isCO2(e.name) ? "—" : toMAD(e.cost || 0)}
                      </td>
                      <td style={{ color: "#38a169" }}>{Number(e.co2_kg || 0).toFixed(3)}</td>
                      <td>
                        <span style={{ color: sc }}>{status}</span>
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#888" }}>
                        {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—"}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="11" style={{ textAlign: "center", color: "#888" }}>
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