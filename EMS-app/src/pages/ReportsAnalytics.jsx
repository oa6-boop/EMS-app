import { useEffect, useState } from "react";
import { fetchConversations, shareReportToConversation } from "../api/chatApi";

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

const BAR_COLORS = ["#7c3aed", "#2563eb", "#059669", "#ea580c", "#64748b"];

function getHighestDemand(energies) {
  const nonCO2 = energies.filter((e) => !isCO2(e.name));
  if (!nonCO2.length) return null;
  return [...nonCO2].sort((a, b) => b.value - a.value)[0];
}

function PrintableBarChart({ energies = [] }) {
  const filtered = energies;

  if (!filtered.length) return null;

  const W = 500;
  const H = 200;
  const barW = Math.min(60, (W - 40) / filtered.length - 8);
  const maxVal = Math.max(...filtered.map((e) => e.value), 1);
  const chartH = H - 40;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ display: "block", width: "100%", maxWidth: W }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={20}
          y1={10 + i * (chartH / 4)}
          x2={W - 10}
          y2={10 + i * (chartH / 4)}
          stroke="#e2e8f0"
          strokeWidth="1"
        />
      ))}

      {filtered.slice(0, 5).map((energy, i) => {
        const barH = Math.max(4, (energy.value / maxVal) * chartH);
        const x = 30 + i * ((W - 40) / Math.min(filtered.length, 5));
        const y = 10 + chartH - barH;

        return (
          <g key={energy.id || i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={BAR_COLORS[i % BAR_COLORS.length]}
              rx="3"
            />

            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize="9"
              fill="#4a5568"
            >
              {energy.value.toFixed(1)}
            </text>

            <text
              x={x + barW / 2}
              y={H - 5}
              textAnchor="middle"
              fontSize="8"
              fill="#718096"
            >
              {energy.name.length > 8 ? energy.name.slice(0, 7) + "…" : energy.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ReportsAnalytics({
  energies = [],
  selectedLineLabel = "Production Line 1",
  selectedEnergyNames = [],
  totalCost = 0,
  peakKw = 0,
  totalCo2 = 0,
  cumulativeKwh = 0,
}) {
  const highestDemand = getHighestDemand(energies);

  const [showShareModal, setShowShareModal] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareSuccess, setShareSuccess] = useState("");

  const cumulativeCostMAD = Number(cumulativeKwh || 0) * 1.4;

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        setConversations((await fetchConversations(token)) || []);
      } catch {
        // ignore
      }
    };

    load();
  }, []);

  const handleExportCSV = () => {
    const now = new Date().toLocaleString();

    const metaRows = [
      ["EMS Energy Report"],
      [`Line: ${selectedLineLabel}`],
      [`Generated: ${now}`],
      [
        `Current Cost: ${toMAD(totalCost)}`,
        `Peak Demand: ${Number(peakKw).toFixed(1)} kW`,
        `Total CO2: ${Number(totalCo2).toFixed(3)} kg`,
      ],
      [
        `Total Energy Consumed: ${Number(cumulativeKwh).toFixed(0)} kWh`,
        `Cumulative Cost: ${cumulativeCostMAD.toFixed(2)} MAD`,
      ],
      [],
    ];

    const headers = [
      "Equipment",
      "Area",
      "Energy Type",
      "Value",
      "Unit",
      "Voltage (V)",
      "Power Factor",
      "Cost (MAD)",
      "CO2 (kg)",
      "Timestamp",
    ];

    const dataRows = energies.map((e) => [
      e.rawData?.equipment || "—",
      e.rawData?.area || "—",
      e.name,
      e.value.toFixed(2),
      e.unit,
      e.rawData?.voltage != null ? Number(e.rawData.voltage).toFixed(1) : "—",
      e.rawData?.power_factor != null
        ? Number(e.rawData.power_factor).toFixed(3)
        : "—",
      isCO2(e.name) ? "—" : toMAD(e.cost || 0),
      Number(e.co2_kg || 0).toFixed(3),
      e.timestamp ? new Date(e.timestamp).toLocaleString() : "—",
    ]);

    const csv = [...metaRows, headers, ...dataRows]
      .map((row) => row.map((c) => `"${c}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `EMS_Report_${selectedLineLabel.replace(
      / /g,
      "_"
    )}_${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const originalTitle = document.title;

    document.title = `EMS_Report_${selectedLineLabel}_${new Date()
      .toISOString()
      .slice(0, 10)}`;

    window.print();
    document.title = originalTitle;
  };

  const getConvLabel = (conv) => {
    if (conv.type === "group") return conv.name || `Group #${conv.id}`;

    if (conv.participants?.length) {
      return conv.participants
        .map((p) => `${p.firstName} ${p.lastName}`)
        .join(", ");
    }

    return `Conversation #${conv.id}`;
  };

  const handleShare = async () => {
    if (!selectedConversationId) {
      setShareError("Please choose a conversation.");
      return;
    }

    try {
      const token = localStorage.getItem("token");

      await shareReportToConversation(
        {
          conversation_id: Number(selectedConversationId),
          file_name: `Report-${selectedLineLabel}.pdf`,
          file_url: "#generated-report",
        },
        token
      );

      setShowShareModal(false);
      setSelectedConversationId("");
      setShareError("");
      setShareSuccess("Report shared successfully.");

      setTimeout(() => setShareSuccess(""), 3000);
    } catch (e) {
      setShareError(e.message || "Failed to share");
    }
  };

  const totalKw = energies
    .filter((e) => e.unit === "kW")
    .reduce((s, e) => s + e.value, 0);

  const realTotalCost =
    totalCost > 0
      ? totalCost
      : energies
          .filter((e) => !isCO2(e.name))
          .reduce((s, e) => s + (e.cost || 0), 0);

  const avgPF = (() => {
    const pfs = energies.map((e) => e.rawData?.power_factor).filter((v) => v != null);
    return pfs.length
      ? (pfs.reduce((s, v) => s + v, 0) / pfs.length).toFixed(3)
      : null;
  })();

  const avgVoltage = (() => {
    const vs = energies.map((e) => e.rawData?.voltage).filter((v) => v != null);
    return vs.length
      ? (vs.reduce((s, v) => s + v, 0) / vs.length).toFixed(1)
      : null;
  })();

  const efficiencyScore = (() => {
    let score = 100;

    if (avgPF) {
      if (Number(avgPF) < 0.9) score -= 15;
      if (Number(avgPF) < 0.85) score -= 10;
    }

    if (avgVoltage && (Number(avgVoltage) < 210 || Number(avgVoltage) > 250)) {
      score -= 10;
    }

    if (peakKw > 450) score -= 10;
    if (peakKw > 500) score -= 10;

    return Math.max(0, score);
  })();

  const scoreColor =
    efficiencyScore >= 85
      ? "#38a169"
      : efficiencyScore >= 70
      ? "#d69e2e"
      : "#e53e3e";

  const forecast = (val, step) =>
    (val + Math.max(step * 0.3, val * 0.05)).toFixed(2);

  return (
    <div className="overview-page reports-export-root" id="reports-export-root">
      <style>{`
        @media print {
          .chatbot-fab,.top-shortcuts,.sidebar,.header-bar,.no-print { display:none!important }
          .main { margin:0!important; padding:0 0.5rem!important }
          body,.layout { background:white!important }
          .overview-page { padding:0!important }
          .panel-card,.section-block,.table-card {
            box-shadow:none!important; border:1px solid #e2e8f0!important;
            break-inside:avoid; page-break-inside:avoid;
          }
          svg { display:block!important; visibility:visible!important; overflow:visible!important }
          .two-column-layout { display:block!important }
          .two-column-layout > * { width:100%!important; margin-bottom:1rem!important; break-inside:avoid }
          .carbon-kpis { display:grid!important; grid-template-columns:repeat(4,1fr)!important }
          .print-footer { display:block!important }
          table { width:100%!important; font-size:0.75rem!important }
          th, td { padding:4px 6px!important }
        }
        .print-footer { display:none }
      `}</style>

      <div className="section-title-wrap reports-header-row">
        <div>
          <h1>Reports & Analytics</h1>
          <p>
            {selectedLineLabel}
            {selectedEnergyNames?.length
              ? ` / ${selectedEnergyNames.join(" • ")}`
              : " / All energies"}{" "}
            — {new Date().toLocaleString()} — Costs in <strong>MAD</strong>
          </p>
        </div>

        <div
          className="reports-actions-row no-print"
          style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}
        >
          <button
            type="button"
            onClick={handleExportCSV}
            style={{
              background: "#38a169",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.55rem 1rem",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            📥 Export CSV
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            style={{
              background: "#4299e1",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.55rem 1rem",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            🖨️ Export PDF
          </button>

          <button
            className="download-report-btn"
            type="button"
            onClick={() => {
              setShowShareModal(true);
              setShareError("");
              setShareSuccess("");
            }}
          >
            📤 Share
          </button>
        </div>
      </div>

      {shareSuccess && <div className="info-box">{shareSuccess}</div>}
      {shareError && <div className="alarm-item">{shareError}</div>}

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Executive Summary</h2>
          <p>Key performance indicators — {selectedLineLabel}</p>
        </div>

        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Current Operating Cost</h4>
            <strong style={{ color: "#d69e2e" }}>{toMAD(realTotalCost)}</strong>
            <span>Same value used in Dashboard</span>
          </div>

          <div className="carbon-card">
            <h4>Total Energy Consumed</h4>
            <strong style={{ color: "#234e52" }}>
              {Number(cumulativeKwh).toFixed(0)} kWh
            </strong>
            <span>Cumulative counter</span>
          </div>

          <div className="carbon-card">
            <h4>Total Cost (cumulative)</h4>
            <strong style={{ color: "#744210" }}>
              {cumulativeCostMAD.toFixed(2)} MAD
            </strong>
            <span>Total consumed × 1.40</span>
          </div>

          <div className="carbon-card">
            <h4>Total Active Power</h4>
            <strong>
              {totalKw > 0
                ? `${totalKw.toFixed(1)} kW`
                : `${Number(peakKw).toFixed(1)} kW`}
            </strong>
            <span>Current demand</span>
          </div>

          <div className="carbon-card">
            <h4>CO₂ Emissions</h4>
            <strong style={{ color: "#38a169" }}>
              {Number(totalCo2).toFixed(3)} kg
            </strong>
            <span>kWh × 0.718</span>
          </div>

          <div className="carbon-card">
            <h4>Power Factor</h4>
            <strong
              style={{
                color: avgPF && Number(avgPF) >= 0.9 ? "#38a169" : "#e53e3e",
              }}
            >
              {avgPF || "—"}
            </strong>
            <span>
              {avgPF ? (Number(avgPF) >= 0.9 ? "Good ✓" : "Low ⚠") : "Waiting..."}
            </span>
          </div>

          <div className="carbon-card">
            <h4>Voltage</h4>
            <strong
              style={{
                color:
                  avgVoltage && Number(avgVoltage) >= 210 ? "#38a169" : "#e53e3e",
              }}
            >
              {avgVoltage ? `${avgVoltage} V` : "—"}
            </strong>
            <span>Average · Nominal 230V</span>
          </div>

          <div className="carbon-card">
            <h4>Efficiency Score</h4>
            <strong style={{ color: scoreColor }}>{efficiencyScore}%</strong>
            <span>Based on PF, voltage, demand</span>
          </div>

          <div className="carbon-card">
            <h4>Peak Demand</h4>
            <strong>{Number(peakKw).toFixed(1)} kW</strong>
            <span>Maximum recorded</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Detailed Energy Report</h2>
          <p>All measurements — {selectedLineLabel}</p>
        </div>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Area</th>
                <th>Energy</th>
                <th>Value</th>
                <th>Forecast +1h</th>
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
                  const sc = { High: "#e53e3e", Low: "#888", Normal: "#38a169" }[
                    status
                  ];

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
                      <td style={{ color: "#4299e1" }}>
                        {forecast(e.value, e.step || 5)}
                      </td>
                      <td>{e.unit}</td>
                      <td>
                        {e.rawData?.voltage != null ? (
                          <span
                            style={{
                              color:
                                Number(e.rawData.voltage) >= 210
                                  ? "#38a169"
                                  : "#e53e3e",
                            }}
                          >
                            {Number(e.rawData.voltage).toFixed(1)} V
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {e.rawData?.power_factor != null ? (
                          <span
                            style={{
                              color:
                                e.rawData.power_factor >= 0.9
                                  ? "#38a169"
                                  : "#e53e3e",
                            }}
                          >
                            {Number(e.rawData.power_factor).toFixed(3)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        style={{
                          color: isCO2(e.name) ? "#94a3b8" : "#d69e2e",
                          fontWeight: 600,
                        }}
                      >
                        {isCO2(e.name) ? "—" : toMAD(e.cost || 0)}
                      </td>
                      <td style={{ color: "#38a169" }}>
                        {Number(e.co2_kg || 0).toFixed(3)}
                      </td>
                      <td>
                        <span style={{ color: sc }}>{status}</span>
                      </td>
                      <td style={{ fontSize: "0.78rem", color: "#888" }}>
                        {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—"}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="12" style={{ textAlign: "center", color: "#888" }}>
                    No data — make sure DataPlatform is running.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="two-column-layout">
        <section className="panel-card">
          <div className="panel-head">
            <div>
              <h2>Consumption Distribution</h2>
            </div>
          </div>

          <PrintableBarChart energies={energies.slice(0, 5)} />

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              marginTop: "0.5rem",
            }}
          >
            {energies.slice(0, 5).map((e, i) => (
              <span
                key={e.id || i}
                style={{
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: BAR_COLORS[i % BAR_COLORS.length],
                    borderRadius: "2px",
                    display: "inline-block",
                  }}
                />
                {e.name}
                {isCO2(e.name) && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      color: "#38a169",
                      background: "#f0fff4",
                      border: "1px solid #c6f6d5",
                      borderRadius: "4px",
                      padding: "0px 4px",
                    }}
                  >
                    kg
                  </span>
                )}
              </span>
            ))}
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-head">
            <div>
              <h2>Analytics Summary</h2>
              <p>Performance indicators</p>
            </div>
          </div>

          <div className="carbon-kpis">
            <div className="carbon-card">
              <h4>Total Sources</h4>
              <strong>{energies.length}</strong>
              <span>Monitored energy types</span>
            </div>

            <div className="carbon-card">
              <h4>Highest Demand</h4>
              <strong style={{ fontSize: "0.85rem" }}>
                {highestDemand?.name || "N/A"}
              </strong>
              <span>
                {highestDemand
                  ? `${highestDemand.value.toFixed(2)} ${highestDemand.unit}`
                  : "—"}
              </span>
            </div>

            <div className="carbon-card">
              <h4>Efficiency Score</h4>
              <strong style={{ color: scoreColor }}>{efficiencyScore}%</strong>
              <span>PF + Voltage + Demand</span>
            </div>

            <div className="carbon-card">
              <h4>CO₂ Factor</h4>
              <strong>0.718 kgCO₂/kWh</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Cost Analysis by Energy Type</h2>
          <p>Financial breakdown in MAD</p>
        </div>

        <div className="carbon-kpis">
          {energies.filter((e) => !isCO2(e.name)).length > 0 ? (
            energies
              .filter((e) => !isCO2(e.name))
              .map((e) => (
                <div className="carbon-card" key={e.id}>
                  <h4>{e.name}</h4>
                  <strong style={{ color: "#d69e2e" }}>
                    {toMAD(e.cost || 0)}
                  </strong>
                  <span>
                    {e.value.toFixed(2)} {e.unit}
                  </span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "#94a3b8",
                      display: "block",
                      marginTop: "0.2rem",
                    }}
                  >
                    CO₂: {Number(e.co2_kg || 0).toFixed(3)} kg
                    {e.rawData?.equipment && ` · ${e.rawData.equipment}`}
                  </span>
                </div>
              ))
          ) : (
            <div className="carbon-card">
              <h4>No data</h4>
              <strong>—</strong>
              <span>Waiting...</span>
            </div>
          )}
        </div>
      </section>

      <div
        className="print-footer"
        style={{
          borderTop: "1px solid #e2e8f0",
          paddingTop: "0.75rem",
          marginTop: "1.5rem",
        }}
      >
        <p
          style={{
            color: "#718096",
            fontSize: "0.78rem",
            textAlign: "center",
          }}
        >
          EMS Report — {selectedLineLabel} — {new Date().toLocaleString()} — CO₂:
          0.718 kgCO₂/kWh  — Costs in MAD — CO₂ shown in kg, not
          billed
        </p>
      </div>

      {showShareModal && (
        <div className="forgot-modal-overlay">
          <div className="forgot-modal">
            <h2>Share Report</h2>
            <p>Select a user or group conversation.</p>

            <select
              value={selectedConversationId}
              onChange={(e) => setSelectedConversationId(e.target.value)}
            >
              <option value="">Choose conversation</option>
              {conversations.map((conv) => (
                <option key={conv.id} value={conv.id}>
                  {getConvLabel(conv)}
                </option>
              ))}
            </select>

            {shareError && (
              <p
                style={{
                  color: "#e53e3e",
                  fontSize: "0.85rem",
                  marginTop: "0.5rem",
                }}
              >
                {shareError}
              </p>
            )}

            <div className="forgot-modal-actions">
              <button type="button" className="login-btn" onClick={handleShare}>
                Share
              </button>

              <button
                type="button"
                className="cancel-forgot-btn"
                onClick={() => {
                  setShowShareModal(false);
                  setSelectedConversationId("");
                  setShareError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}