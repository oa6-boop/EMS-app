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


const isDirectCO2Measurement = (e) => {
  const n = (e?.name || "").toLowerCase();
  return isCO2(n) || String(e?.unit || "").toLowerCase().includes("co2");
};

const isSecMeasurement = (e) => {
  const n = (e?.name || "").toLowerCase();
  return n === "sec" || n.includes("specific energy") || n.includes("sec");
};

const isPowerQualityMeasurement = (e) => {
  const n = (e?.name || "").toLowerCase();
  const u = String(e?.unit || "").toLowerCase();
  return (
    n.includes("voltage") ||
    n.includes("frequency") ||
    n.includes("power factor") ||
    n.includes("thd") ||
    n.includes("current") ||
    u === "v" ||
    u === "hz" ||
    u === "a" ||
    u === "%" ||
    u === "pu"
  );
};

const isFlowMeasurement = (e) => {
  const n = (e?.name || "").toLowerCase();
  const u = String(e?.unit || "").toLowerCase();
  return n.includes("flow") || u.includes("/h") || u.includes("m³/h") || u.includes("m3/h");
};

const isBillableMeasurement = (e) => {
  if (!e) return false;
  if (isDirectCO2Measurement(e) || isSecMeasurement(e) || isPowerQualityMeasurement(e)) return false;
  if (isFlowMeasurement(e)) return false;
  const n = (e.name || "").toLowerCase();
  const u = String(e.unit || "").toLowerCase();
  return (
    Number(e.cost || 0) > 0 ||
    n.includes("electric") ||
    n.includes("water") ||
    n.includes("steam") ||
    n.includes("fuel") ||
    n.includes("gas") ||
    n.includes("diesel") ||
    n.includes("solar") ||
    n.includes("compressed air") ||
    u === "kwh" ||
    u === "m³" ||
    u === "m3" ||
    u === "l" ||
    u === "kg" ||
    u === "tonne"
  );
};

function formatNumber(value, digits = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (Math.abs(n) >= 100) return n.toFixed(1);
  return n.toFixed(digits);
}

function getKpiMeta(e) {
  const name = (e?.name || "").toLowerCase();
  const unit = String(e?.unit || "").toLowerCase();

  if (name.includes("water") || name.includes("eau")) {
    return { icon: "💧", color: "#0284c7", category: "Water" };
  }
  if (isFlowMeasurement(e)) {
    return { icon: "🌊", color: "#0891b2", category: "Flow" };
  }
  if (isSecMeasurement(e)) {
    return { icon: "📊", color: "#7c3aed", category: "Efficiency" };
  }
  if (isDirectCO2Measurement(e)) {
    return { icon: "🌿", color: "#16a34a", category: "Environment" };
  }
  if (name.includes("voltage") || unit === "v") {
    return { icon: "🔌", color: "#2563eb", category: "Power Quality" };
  }
  if (name.includes("frequency") || unit === "hz") {
    return { icon: "〰️", color: "#0f766e", category: "Power Quality" };
  }
  if (name.includes("power factor")) {
    return { icon: "↗", color: "#9333ea", category: "Power Quality" };
  }
  if (name.includes("thd")) {
    return { icon: "⚠️", color: "#ea580c", category: "Power Quality" };
  }
  if (name.includes("current") || unit === "a") {
    return { icon: "🔋", color: "#64748b", category: "Electrical" };
  }
  if (name.includes("kwh") || unit === "kwh") {
    return { icon: "⚡", color: "#7c3aed", category: "Energy" };
  }
  if (name.includes("electric") || unit === "kw") {
    return { icon: "⚡", color: "#2563eb", category: "Power" };
  }
  if (name.includes("steam")) {
    return { icon: "♨️", color: "#f97316", category: "Steam" };
  }
  if (name.includes("fuel") || name.includes("diesel") || name.includes("gas")) {
    return { icon: "⛽", color: "#dc2626", category: "Fuel" };
  }

  // ── Nouvelles mesures de la DataPlatform Al Youssoufia ──────────────────────
  if (name.includes("reactive") || unit === "kvar") {
    return { icon: "🔄", color: "#8b5cf6", category: "Electrical" };
  }
  if (name.includes("apparent") || unit === "kva") {
    return { icon: "📐", color: "#6366f1", category: "Electrical" };
  }
  if (name.includes("breaker")) {
    return { icon: "🔘", color: "#334155", category: "Equipment Status" };
  }
  if (name.includes("production")) {
    return { icon: "🏭", color: "#b45309", category: "Production" };
  }
  if (name.includes("temperature") || unit === "°c") {
    return { icon: "🌡️", color: "#dc2626", category: "Process" };
  }
  if (name.includes("pressure") || unit === "bar") {
    return { icon: "🎚️", color: "#0e7490", category: "Process" };
  }
  if (name.includes("air")) {
    return { icon: "💨", color: "#0891b2", category: "Compressed Air" };
  }
  if (name.includes("speed")) {
    return { icon: "⚙️", color: "#475569", category: "Process" };
  }

  return { icon: "📡", color: "#475569", category: "DataPlatform KPI" };
}

// Unités qui s'ADDITIONNENT entre équipements (consommations, débits, puissances).
// Les autres (°C, bar, %, on/off…) sont MOYENNÉES : une somme n'aurait pas de sens.
const SUMMABLE_UNITS = new Set([
  "kW", "kWh", "kVAR", "kVA", "m³", "m³/h", "t/h", "tonne", "L", "L/h", "kgCO2", "kg",
]);

function buildLatestKpis(energies = []) {
  // 1) Dernier relevé par équipement + énergie
  const byKey = new Map();
  energies.forEach((e, index) => {
    const key = `${e.line || ""}|${e.zone || ""}|${e.equipment || ""}|${e.name || ""}|${e.unit || ""}`;
    const current = byKey.get(key);
    const ts = e.timestamp ? new Date(e.timestamp).getTime() : index;
    const cts = current?.timestamp ? new Date(current.timestamp).getTime() : -1;
    if (!current || ts >= cts) byKey.set(key, e);
  });

  // 2) UNE SEULE carte par énergie : agrégation sur tous les équipements
  //    de la ligne (somme ou moyenne selon l'unité) — plus de doublons.
  const byEnergy = new Map();
  [...byKey.values()].forEach((e) => {
    const key = `${e.name || ""}|${e.unit || ""}`;
    const current = byEnergy.get(key);
    if (!current) {
      byEnergy.set(key, {
        ...e,
        value: Number(e.value || 0),
        cost: Number(e.cost || 0),
        co2_kg: Number(e.co2_kg || 0),
        count: 1,
      });
    } else {
      current.value += Number(e.value || 0);
      current.cost += Number(e.cost || 0);
      current.co2_kg += Number(e.co2_kg || 0);
      current.count += 1;
      if (e.timestamp && (!current.timestamp || new Date(e.timestamp) > new Date(current.timestamp))) {
        current.timestamp = e.timestamp;
      }
    }
  });

  return [...byEnergy.values()]
    .map((e) => ({
      ...e,
      value: SUMMABLE_UNITS.has(e.unit || "") ? e.value : e.value / e.count,
      equipment: e.count > 1 ? `${e.count} equipment` : e.equipment,
    }))
    .sort((a, b) => {
      const priority = (e) => {
        if ((e.unit || "") === "kW") return 1;
        if ((e.unit || "") === "kWh") return 2;
        if (isDirectCO2Measurement(e)) return 3;
        if (isSecMeasurement(e)) return 4;
        if ((e.name || "").toLowerCase().includes("water")) return 5;
        if (isFlowMeasurement(e)) return 6;
        if (isPowerQualityMeasurement(e)) return 7;
        return 9;
      };
      return priority(a) - priority(b) || String(a.name).localeCompare(String(b.name));
    });
}

function SECCalculator({ selectedLineLabel, energies = [] }) {
  // SEC industriel = énergie consommée PAR TONNE de phosphate produite.
  // Calcul temps réel avec les débits de la DataPlatform :
  //   kW ÷ (t/h) = kWh/t · vapeur (t/h) ÷ (t/h) = t/t · fuel (L/h) ÷ (t/h) = L/t
  // La production vient des Weigh Belt Scales (série "Production Rate").
  const lowerName = (e) => String(e.name || "").toLowerCase();
  const sumBy = (predicate) =>
    energies.filter(predicate).reduce((s, e) => s + Number(e.value || 0), 0);

  const productionRate = sumBy((e) => lowerName(e) === "production rate"); // t/h
  const totalKw        = sumBy((e) => e.unit === "kW");                    // kW
  const steamFlow      = sumBy((e) => lowerName(e) === "steam flow");      // t/h
  const fuelFlow       = sumBy((e) => lowerName(e) === "fuel flow");       // L/h
  const waterFlow      = sumBy((e) => lowerName(e) === "flow rate");       // m³/h (eau)

  const hasProduction = productionRate > 0;
  const secPerEnergy = [
    { label: "Electricity", value: hasProduction && totalKw   > 0 ? totalKw   / productionRate : null, unit: "kWh/t", color: "#4299e1", icon: "⚡" },
    { label: "Steam",       value: hasProduction && steamFlow > 0 ? steamFlow / productionRate : null, unit: "t/t",   color: "#ed8936", icon: "♨️" },
    { label: "Fuel",        value: hasProduction && fuelFlow  > 0 ? fuelFlow  / productionRate : null, unit: "L/t",   color: "#e53e3e", icon: "⛽" },
    { label: "Water",       value: hasProduction && waterFlow > 0 ? waterFlow / productionRate : null, unit: "m³/t",  color: "#0891b2", icon: "💧" },
  ];
  const sec = secPerEnergy[0].value; // SEC électrique = indicateur principal
  const secColor = "#4299e1";

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

      <div className="carbon-kpis" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <div className="carbon-card">
          <h4>⛏️ Production</h4>
          <strong style={{ color: "#16a34a" }}>
            {hasProduction ? `${productionRate.toFixed(1)} t/h` : "—"}
          </strong>
          <span>Phosphate — weigh belt scales</span>
        </div>

        {secPerEnergy.map((s) => (
          <div className="carbon-card" key={s.label}>
            <h4>{s.icon} {s.label} SEC</h4>
            <strong style={{ color: s.color, fontSize: "1.15rem" }}>
              {s.value != null ? s.value.toFixed(2) : "—"}
            </strong>
            <span>{s.unit} of phosphate</span>
          </div>
        ))}
      </div>

      {!hasProduction && (
        <div className="info-box" style={{ marginTop: "0.75rem" }}>
          ⏳ Waiting for <strong>production data</strong> (weigh belt scales) from DataPlatform.
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

  // Totaux par énergie (somme sur les équipements de la ligne) — cartes
  // principales : vapeur, fuel, eau et production (phosphate).
  const sumByName = (needle) =>
    energies
      .filter((e) => String(e.name || "").toLowerCase() === needle)
      .reduce((s, e) => s + Number(e.value || 0), 0);

  const steamTotal     = sumByName("steam");                 // tonnes (totalisateur)
  const fuelTotal      = sumByName("fuel");                  // litres (totalisateur)
  const waterTotal     = sumByName("water");                 // m³
  const productionRate = sumByName("production rate");       // t/h (débit balances)
  const phosphateTons  = sumByName("phosphate production");  // t (cumul produit)

  const co2Display = totalCo2 > 0 ? totalCo2 : cumulativeKwh > 0 ? cumulativeKwh * 0.718 : 0;

  const MAX_KW = 300;
  const METER_MAX_KW = 10;
  const RUNNING_THRESHOLD = 1;
  const STANDBY_THRESHOLD = 0.1;

  const realCost = energies
    .filter((e) => !isCO2(e.name))
    .reduce((s, e) => s + Number(e.cost || 0), 0);

  const displayCost = totalCost > 0 ? totalCost : realCost;

  // KPI PRINCIPAUX uniquement — un par énergie, agrégé sur la ligne.
  // Les mesures techniques (breaker, températures, pressions, vitesses,
  // kVAR/kVA, débits internes…) restent dans leurs pages dédiées
  // (Power Quality, Equipment Status, Real-Time Monitoring).
  const MAIN_KPI_NAMES = new Set([
    "electricity", "electricity-kwh", "co2-emissions", "sec",
    "water", "steam", "fuel", "phosphate production",
  ]);

  // UNE entrée par énergie (agrégée sur tous les équipements de la ligne) —
  // utilisée par toutes les sections "par énergie" du Dashboard pour rester
  // lisible : plus de doublons Electricity ×7 ni de mesures techniques.
  const aggregatedKpis = buildLatestKpis(energies);

  const allDataPlatformKpis = aggregatedKpis.filter(
    (e) => MAIN_KPI_NAMES.has(String(e.name || "").toLowerCase())
  );

  // "Cost by Energy Type" : uniquement les énergies FACTURABLES, agrégées.
  const BILLABLE_NAMES = new Set([
    "electricity", "electricity-kwh", "steam", "fuel", "water",
    "hot water", "natural gas", "lpg", "diesel", "gasoline",
  ]);
  const billableMeasurements = aggregatedKpis.filter(
    (e) => BILLABLE_NAMES.has(String(e.name || "").toLowerCase())
  );

  // Barres "Energy Performance" : les mêmes KPI principaux, agrégés.
  const chartMeasurements = allDataPlatformKpis;

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
            <p>Operating Cost</p>
            <span>All billable energies — electricity, steam, fuel, water</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon emerald">🔋</div>
            <div className="kpi-badge green">Live</div>
            <h3>{cumulativeKwh > 0 ? `${Number(cumulativeKwh).toFixed(1)} kWh` : "—"}</h3>
            <p>Cumulative Energy</p>
            <span>Total energy counter (kWh)</span>
          </div>

          {/* ── Énergies process de la DataPlatform (affichées si reçues) ── */}
          {steamTotal > 0 && (
            <div className="kpi-card">
              <div className="kpi-icon orange">♨️</div>
              <div className="kpi-badge amber">Live</div>
              <h3>{steamTotal.toFixed(1)} t</h3>
              <p>Steam Consumed</p>
              <span>Steam meter totalizer</span>
            </div>
          )}

          {fuelTotal > 0 && (
            <div className="kpi-card">
              <div className="kpi-icon red">⛽</div>
              <div className="kpi-badge red">Live</div>
              <h3>{fuelTotal.toFixed(1)} L</h3>
              <p>Fuel Consumed</p>
              <span>Fuel meter totalizer </span>
            </div>
          )}

          {/* Eau : KPI principal — toujours visible */}
          <div className="kpi-card">
            <div className="kpi-icon blue">💧</div>
            <div className="kpi-badge blue">Live</div>
            <h3>{waterTotal > 0 ? `${waterTotal.toFixed(1)} m³` : "—"}</h3>
            <p>Water Consumed</p>
            <span>Flow meters + line total</span>
          </div>

          {(phosphateTons > 0 || productionRate > 0) && (
            <div className="kpi-card">
              <div className="kpi-icon emerald">⛏️</div>
              <div className="kpi-badge green">Live</div>
              <h3>{phosphateTons > 0 ? `${phosphateTons.toFixed(1)} t` : "—"}</h3>
              <p>Phosphate Production</p>
              <span>
                Total produced (weigh belt scales)
                {productionRate > 0 ? ` · now: ${productionRate.toFixed(0)} t/h` : ""}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Key Energy KPIs</h2>
          <p>
            Main energy indicators  — {selectedLineLabel}
            {allDataPlatformKpis.length === 0 && " — Waiting for data..."}
          </p>
        </div>

        <div className="kpi-grid">
          {allDataPlatformKpis.length > 0 ? (
            allDataPlatformKpis.map((e) => {
              const meta = getKpiMeta(e);
              const updated = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—";
              const tooltip = `${e.name}\nValue: ${formatNumber(e.value, 3)} ${e.unit || ""}\nPlant: ${e.plant || "—"}\nLine: ${e.line || "—"}\nZone: ${e.zone || e.area || "—"}\nEquipment: ${e.equipment || "—"}\nUpdated: ${updated}`;

              return (
                <div className="kpi-card" key={`${e.line}-${e.zone}-${e.equipment}-${e.name}-${e.unit}`} title={tooltip}>
                  <div className="kpi-icon" style={{ background: `${meta.color}18`, color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div className="kpi-badge" style={{ background: meta.color }}>Live</div>
                  <h3 style={{ color: meta.color }}>
                    {formatNumber(e.value, 3)} {e.unit}
                  </h3>
                  <p>{e.name}</p>
                  <span>
                    {meta.category} · {e.equipment || "Equipment"} · {updated}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="kpi-card">
              <div className="kpi-icon blue">📡</div>
              <h3>—</h3>
              <p>No DataPlatform KPI yet</p>
              <span>Start MQTT/Kafka data flow</span>
            </div>
          )}
        </div>
      </section>

      <MultiLineComparison backendSummary={backendSummary} />

      <section className="section-block">
        <SECCalculator
          selectedLineLabel={selectedLineLabel}
          energies={energies}
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

        {/* Filtre par tags — juste avant les équipements qu'il filtre */}
        <TagFilter
          availableTags={availableTags}
          selectedTag={selectedTag}
          onTagSelect={onTagSelect}
        />

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
            {chartMeasurements.length > 0 ? (
              chartMeasurements.slice(0, 8).map((energy, i) => (
                <div
                  key={energy.id}
                  className={`bar ${["purple", "blue", "green", "orange", "gray"][i % 5]}`}
                  style={{
                    height: `${Math.min(90, Math.max(10, (energy.value / (energy.max || 500)) * 100))}%`,
                  }}
                  title={`${energy.name}\n${energy.value.toFixed(2)} ${energy.unit}${energy.equipment ? `\n${energy.equipment}` : ""}${energy.timestamp ? `\n${new Date(energy.timestamp).toLocaleTimeString()}` : ""}`}
                />
              ))
            ) : (
              <p style={{ color: "#888", padding: "1rem" }}>Waiting for DataPlatform data...</p>
            )}
          </div>

          <div className="zone-labels">
            {chartMeasurements.slice(0, 8).map((e) => (
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
            {billableMeasurements.length > 0 ? (
              billableMeasurements.map((e) => (
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
                <span>Waiting for billable DataPlatform data</span>
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