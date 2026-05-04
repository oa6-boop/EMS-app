const MAX_KW_PER_METER = 300;

export default function EquipmentStatus({ energies = [], selectedLineLabel = "Production Line 1" }) {
  const equipmentMap = {};
  energies.forEach(energy => {
    const eqName = energy.rawData?.equipment || "Unknown";
    if (!equipmentMap[eqName]) {
      equipmentMap[eqName] = {
        name: eqName, area: energy.rawData?.area || "—",
        unit_name: energy.rawData?.unit_name || "—",
        plant: energy.rawData?.plant || "Plant 1",
        energies: [], kw: null, kwh: null,
        voltage: energy.rawData?.voltage, power_factor: energy.rawData?.power_factor,
        frequency: energy.rawData?.frequency,
      };
    }
    equipmentMap[eqName].energies.push(energy);
    if (energy.unit === "kW") {
      equipmentMap[eqName].kw = energy.value;
      if (energy.rawData?.voltage)      equipmentMap[eqName].voltage      = energy.rawData.voltage;
      if (energy.rawData?.power_factor) equipmentMap[eqName].power_factor = energy.rawData.power_factor;
    }
    if (energy.unit === "kWh") equipmentMap[eqName].kwh = energy.value;
  });

  const equipments = Object.values(equipmentMap);

  const getStatus = (kw) =>
    kw == null ? { label: "Unknown",  cls: "",        color: "#888" } :
    kw > 10    ? { label: "Running",  cls: "running", color: "#38a169" } :
    kw > 0     ? { label: "Standby",  cls: "",        color: "#d69e2e" } :
                 { label: "Off",      cls: "",        color: "#e53e3e" };

  const getLoad      = (kw) => kw != null ? Math.min(100, Math.round((kw / MAX_KW_PER_METER) * 100)) : 0;
  const getLoadColor = (load) => load > 90 ? "red" : load > 70 ? "yellow" : "green";

  const running = equipments.filter(eq => (eq.kw || 0) > 10).length;
  const standby = equipments.filter(eq => (eq.kw || 0) > 0 && (eq.kw || 0) <= 10).length;
  const totalKw = equipments.reduce((s, eq) => s + (eq.kw || 0), 0);

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Equipment Status</h1>
        <p>
          Real-time status of meters — {selectedLineLabel}
          {equipments.length === 0 && " — Waiting for DataPlatform data..."}
        </p>
      </div>

      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Total Meters</h4>
            <strong>{equipments.length || "—"}</strong>
            <span> Devices monitored</span>
          </div>
          <div className="carbon-card">
            <h4>Running</h4>
            <strong style={{ color: "#38a169" }}>{running}</strong>
            <span>Active Power &gt; 10 kW</span>
          </div>
          <div className="carbon-card">
            <h4>Standby</h4>
            <strong style={{ color: "#d69e2e" }}>{standby}</strong>
            <span>Active Power 0–10 kW</span>
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
          <p> Names and values of meters</p>
        </div>
        <div className="equipment-grid">
          {equipments.length > 0 ? (
            equipments.map(eq => {
              const status = getStatus(eq.kw);
              const load   = getLoad(eq.kw);
              return (
                <div className="equipment-card" key={eq.name}>
                  <div className="equipment-top">
                    <div>
                      <small>{eq.area}</small>
                      <h4>{eq.name}</h4>
                    </div>
                    <span className={`status ${status.cls}`} style={{ color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                  <div className="equipment-meta">
                    {eq.kw != null && `⚡ ${eq.kw.toFixed(1)} kW`}
                    {eq.voltage != null && ` · ${Number(eq.voltage).toFixed(0)} V`}
                    {eq.power_factor != null && ` · PF ${Number(eq.power_factor).toFixed(2)}`}
                  </div>
                  <div className="equipment-load-row">
                    <span>Load</span><strong>{load}%</strong>
                  </div>
                  <div className={`progress-line ${getLoadColor(load)}`}>
                    <div style={{ width: `${load}%`, transition: "width 0.5s" }} />
                  </div>
                  <div className="equipment-footer">
                    {eq.unit_name} · {eq.plant}
                    {eq.kwh != null && ` · ${eq.kwh.toFixed(1)} kWh`}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "2rem", color: "#888" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚙</div>
              <h4>Waiting for Modbus Data</h4>
              <p style={{ marginTop: "0.5rem" }}>Make sure modbus-publisher is publishing data.</p>
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
                <th>Equipment</th><th>Area</th><th>Unit</th>
                <th>Active Power</th><th>Voltage</th><th>Power Factor</th>
                <th>kWh</th><th>Load</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {equipments.length > 0 ? (
                equipments.map(eq => {
                  const status = getStatus(eq.kw);
                  const load   = getLoad(eq.kw);
                  return (
                    <tr key={eq.name}>
                      <td><strong>{eq.name}</strong></td>
                      <td>{eq.area}</td>
                      <td>{eq.unit_name}</td>
                      <td>{eq.kw != null ? `${eq.kw.toFixed(2)} kW` : "—"}</td>
                      <td>
                        {eq.voltage != null ? (
                          <span style={{ color: Number(eq.voltage) >= 380 ? "#38a169" : "#e53e3e" }}>
                            {Number(eq.voltage).toFixed(1)} V
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        {eq.power_factor != null ? (
                          <span style={{ color: eq.power_factor >= 0.9 ? "#38a169" : "#e53e3e" }}>
                            {Number(eq.power_factor).toFixed(3)}
                          </span>
                        ) : "—"}
                      </td>
                      <td>{eq.kwh != null ? eq.kwh.toFixed(2) : "—"}</td>
                      <td>{load}%</td>
                      <td style={{ color: status.color }}><strong>{status.label}</strong></td>
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