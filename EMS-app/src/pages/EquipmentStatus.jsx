import TagFilter from "../components/TagFilter.jsx";
import EquipmentHoverChart from "../components/EquipmentHoverChart.jsx";

const MAX_KW_PER_METER = 10;
const RUNNING_THRESHOLD = 1;
const STANDBY_THRESHOLD = 0.1;

export default function EquipmentStatus({
  energies = [],
  selectedLineLabel = "Production Line 1",
  availableTags = [],
  selectedTag = "",
  onTagSelect,
}) {
  const equipmentMap = {};

  energies.forEach((energy) => {
    const eqName = energy.rawData?.equipment || "Unknown";

    if (!equipmentMap[eqName]) {
      equipmentMap[eqName] = {
        name: eqName,
        tags: energy.tags || [],
        area: energy.rawData?.area || "—",
        unit_name: energy.rawData?.unit_name || "—",
        plant: energy.rawData?.plant || "Plant 1",
        energies: [],
        kw: null,
        kwh: null,
        voltage: energy.rawData?.voltage,
        power_factor: energy.rawData?.power_factor,
        frequency: energy.rawData?.frequency,
        primary: null,   // mesure principale des appareils de procédé (non électriques)
      };
    }

    equipmentMap[eqName].energies.push(energy);

    if (energy.unit === "kW") {
      equipmentMap[eqName].kw = energy.value;

      if (energy.rawData?.voltage) {
        equipmentMap[eqName].voltage = energy.rawData.voltage;
      }

      if (energy.rawData?.power_factor) {
        equipmentMap[eqName].power_factor = energy.rawData.power_factor;
      }
    }

    if (energy.unit === "kWh") {
      equipmentMap[eqName].kwh = energy.value;
    }

    // Breaker Status envoyé par la DataPlatform (1 = fermé/alimenté, 0 = ouvert)
    if ((energy.name || "").toLowerCase().includes("breaker")) {
      equipmentMap[eqName].breaker = Number(energy.value);
    }

    // Appareils de procédé (débitmètres, balances, compteur vapeur…) :
    // on retient leur mesure principale (1re mesure non-électrique / non-technique)
    // pour ne PAS afficher "—".
    const nm = String(energy.name || "").toLowerCase();
    const isTechnical = /voltage|current|frequency|power factor|thd|breaker|co2|co₂|reactive|apparent|\bsec\b|specific energy/.test(nm);
    if (
      energy.unit !== "kW" && energy.unit !== "kWh" && !isTechnical &&
      !equipmentMap[eqName].primary && energy.value != null && energy.value !== ""
    ) {
      equipmentMap[eqName].primary = { name: energy.name, value: Number(energy.value || 0), unit: energy.unit };
    }
  });

  // Les rollups de zone/ligne (Extraction, Washing, Utilities, Storage Handling,
  // Flotation, Total…) ne sont PAS des équipements physiques — juste un compteur
  // kWh de zone. On les retire des cartes ET du tableau.
  const isZoneAggregate = (eq) => {
    const name = String(eq.name || "").trim().toLowerCase();
    const area = String(eq.area || "").trim().toLowerCase();
    // Rollup de ZONE (l'équipement porte le nom de sa zone) ou de LIGNE
    // (zone « Line Total » : Total / Total water consumption). Ce ne sont PAS
    // des équipements physiques, quel que soit leur contenu (kW, débit, kWh).
    return area === "line total" || name === area;
  };

  const equipments = Object.values(equipmentMap).filter((eq) => !isZoneAggregate(eq));

  // Le breaker (DataPlatform) prime : disjoncteur ouvert = équipement hors tension.
  // Statut selon la donnée disponible : kW (électrique) → Running/Standby/Off ;
  // mesure de procédé → Active/Idle ; compteur d'énergie (kWh seul) → Metering.
  const getStatus = (kw, breaker, primary, kwh) =>
    breaker === 0
      ? { label: "Breaker Open", cls: "", color: "#e53e3e" }
      : kw != null
      ? (kw > RUNNING_THRESHOLD
          ? { label: "Running", cls: "running", color: "#38a169" }
          : kw > STANDBY_THRESHOLD
          ? { label: "Standby", cls: "", color: "#d69e2e" }
          : { label: "Off", cls: "", color: "#e53e3e" })
      : primary
      ? (primary.value > 0
          ? { label: "Active", cls: "running", color: "#38a169" }
          : { label: "Idle", cls: "", color: "#d69e2e" })
      : kwh != null
      ? { label: "Metering", cls: "running", color: "#38a169" }
      : { label: "Unknown", cls: "", color: "#888" };

  const getLoad = (kw) =>
    kw != null ? Math.min(100, Math.round((kw / MAX_KW_PER_METER) * 100)) : 0;

  const getLoadColor = (load) =>
    load > 90 ? "red" : load > 70 ? "yellow" : "green";

  const running = equipments.filter((eq) => (eq.kw || 0) > RUNNING_THRESHOLD).length;

  const standby = equipments.filter(
    (eq) =>
      (eq.kw || 0) > STANDBY_THRESHOLD &&
      (eq.kw || 0) <= RUNNING_THRESHOLD
  ).length;

  const totalKw = equipments.reduce((s, eq) => s + (eq.kw || 0), 0);

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Equipment Status</h1>
        <p>
          Real-time status of meters — {selectedLineLabel}
          {selectedTag ? ` — #${selectedTag}` : ""}
          {equipments.length === 0 && " — Waiting for DataPlatform data..."}
        </p>
      </div>

      <TagFilter
        availableTags={availableTags}
        selectedTag={selectedTag}
        onTagSelect={onTagSelect}
      />

      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Total Meters</h4>
            <strong>{equipments.length || "—"}</strong>
            <span>Devices monitored</span>
          </div>

          <div className="carbon-card">
            <h4>Running</h4>
            <strong style={{ color: "#38a169" }}>{running}</strong>
            <span>Active Power &gt; {RUNNING_THRESHOLD} kW</span>
          </div>

          <div className="carbon-card">
            <h4>Standby</h4>
            <strong style={{ color: "#d69e2e" }}>{standby}</strong>
            <span>
              Active Power {STANDBY_THRESHOLD}–{RUNNING_THRESHOLD} kW
            </span>
          </div>

          <div className="carbon-card">
            <h4>Total Load</h4>
            <strong>{totalKw.toFixed(1)} kW</strong>
            <span>All meters combined</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Equipment Cards</h2>
          <p>Names and values of meters</p>
        </div>

        <div className="equipment-grid">
          {equipments.length > 0 ? (
            equipments.map((eq) => {
              const isProcess = eq.kw == null && eq.primary;
              const isMeter = eq.kw == null && !eq.primary && eq.kwh != null;
              const status = getStatus(eq.kw, eq.breaker, eq.primary, eq.kwh);
              const load = getLoad(eq.kw);

              return (
                // Survol : mini-courbe de consommation réelle de l'équipement
                <EquipmentHoverChart
                  key={eq.name}
                  line={selectedLineLabel}
                  equipment={eq.name}
                >
                <div className="equipment-card">
                  <div className="equipment-top">
                    <div>
                      <small>{eq.area}</small>
                      <h4>{eq.name}</h4>
                      {eq.tags && eq.tags.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                          {eq.tags.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => onTagSelect?.(selectedTag === t ? "" : t)}
                              title={`Filter by #${t}`}
                              style={{
                                fontSize: "0.62rem",
                                fontWeight: 600,
                                padding: "1px 7px",
                                borderRadius: "999px",
                                cursor: "pointer",
                                border: selectedTag === t ? "1px solid #2563eb" : "1px solid #dbe3ef",
                                background: selectedTag === t ? "#2563eb" : "transparent",
                                color: selectedTag === t ? "#fff" : "var(--text-secondary)",
                              }}
                            >
                              #{t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <span
                      className={`status ${status.cls}`}
                      style={{ color: status.color }}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="equipment-meta">
                    {eq.kw != null ? (
                      <>
                        ⚡ {eq.kw.toFixed(1)} kW
                        {eq.voltage != null && ` · ${Number(eq.voltage).toFixed(0)} V`}
                        {eq.power_factor != null && ` · PF ${Number(eq.power_factor).toFixed(2)}`}
                      </>
                    ) : isProcess ? (
                      <>📊 {eq.primary.value.toFixed(1)} {eq.primary.unit} · <span style={{ color: "var(--text-secondary)" }}>{eq.primary.name}</span></>
                    ) : isMeter ? (
                      <>⚡ {eq.kwh.toFixed(1)} kWh · <span style={{ color: "var(--text-secondary)" }}>Energy counter</span></>
                    ) : (
                      "—"
                    )}
                  </div>

                  {!isProcess && !isMeter && (
                    <>
                      <div className="equipment-load-row">
                        <span>Load</span>
                        <strong>{load}%</strong>
                      </div>
                      <div className={`progress-line ${getLoadColor(load)}`}>
                        <div style={{ width: `${load}%`, transition: "width 0.5s" }} />
                      </div>
                    </>
                  )}

                  <div className="equipment-footer">
                    {eq.unit_name} · {eq.plant}
                    {eq.kwh != null && ` · ${eq.kwh.toFixed(1)} kWh`}
                  </div>
                </div>
                </EquipmentHoverChart>
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
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚙</div>
              <h4>Waiting for DataPlatform Data</h4>
              <p style={{ marginTop: "0.5rem" }}>
                Make sure the DataPlatform is publishing data.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Equipment Summary Table</h2>
          <p>All monitored meters with real-time values</p>
        </div>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Area</th>
                <th>Unit</th>
                <th>Active Power</th>
                <th>Voltage</th>
                <th>Power Factor</th>
                <th>kWh</th>
                <th>Load</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {equipments.length > 0 ? (
                equipments.map((eq) => {
                  const status = getStatus(eq.kw, eq.breaker, eq.primary, eq.kwh);
                  const load = getLoad(eq.kw);

                  return (
                    <tr key={eq.name}>
                      <td>
                        <strong>{eq.name}</strong>
                      </td>
                      <td>{eq.area}</td>
                      <td>{eq.unit_name}</td>
                      <td>{eq.kw != null ? `${eq.kw.toFixed(2)} kW` : "—"}</td>
                      <td>
                        {eq.voltage != null ? (
                          <span
                            style={{
                              color:
                                Number(eq.voltage) >= 210 ? "#38a169" : "#e53e3e",
                            }}
                          >
                            {Number(eq.voltage).toFixed(1)} V
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {eq.power_factor != null ? (
                          <span
                            style={{
                              color:
                                eq.power_factor >= 0.9 ? "#38a169" : "#e53e3e",
                            }}
                          >
                            {Number(eq.power_factor).toFixed(3)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{eq.kwh != null ? eq.kwh.toFixed(2) : "—"}</td>
                      <td>{load}%</td>
                      <td style={{ color: status.color }}>
                        <strong>{status.label}</strong>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" style={{ textAlign: "center", color: "#888" }}>
                    No equipment data — DataPlatform not connected.
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