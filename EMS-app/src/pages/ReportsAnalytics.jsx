import { useEffect, useState } from "react";
import { fetchConversations, uploadChatFile } from "../api/chatApi";
import { fetchInvoice } from "../api/emsApi";
import jsPDF from "jspdf";
import { aggregateByEnergy, isAggregateRollup, groupByEquipment } from "../utils/energyAggregation.js";
import { svgEventPoint, SvgHoverTooltip } from "../components/ChartTooltip.jsx";

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
  const [hover, setHover] = useState(null);

  if (!filtered.length) return null;

  const W = 500;
  const H = 200;
  const shown = filtered.slice(0, 5);
  const barW = Math.min(60, (W - 40) / filtered.length - 8);
  const maxVal = Math.max(...filtered.map((e) => e.value), 1);
  const chartH = H - 40;
  const slotW = (W - 40) / Math.min(filtered.length, 5);

  // Étiquette au survol d'une barre : énergie + valeur + équipement
  const handleMove = (evt) => {
    const { x } = svgEventPoint(evt, W, H);
    const i = Math.max(0, Math.min(shown.length - 1, Math.floor((x - 30) / slotW)));
    const energy = shown[i];
    if (!energy) return;
    const barH = Math.max(4, (energy.value / maxVal) * chartH);
    setHover({
      x: 30 + i * slotW + barW / 2,
      y: 10 + chartH - barH,
      lines: [
        energy.name,
        `${Number(energy.value || 0).toFixed(3)} ${energy.unit || ""}`.trim(),
        energy.equipment || "Equipment",
      ],
    });
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ display: "block", width: "100%", maxWidth: W }}
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
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
              opacity={hover && hover.lines[0] === energy.name ? 1 : 0.9}
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
      {hover && (
        <SvgHoverTooltip {...hover} W={W} H={H} color="#7c3aed" guideTop={10} guideBottom={10 + chartH} />
      )}
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

  // Équipements physiques uniquement (sans rollups zone/ligne) : le rollup
  // « Total » porte déjà la somme des équipements → l'inclure doublerait
  // coûts et quantités dans les tableaux, CSV, PDF et cartes de coût.
  // Un rollup n'est gardé que si son énergie n'existe sur aucun équipement.
  const physicalList = energies.filter((e) => !isAggregateRollup(e));
  const physNames = new Set(physicalList.map((e) => String(e.name || "").toLowerCase()));
  const kpiSource = [
    ...physicalList,
    ...energies.filter(
      (e) => isAggregateRollup(e) && !physNames.has(String(e.name || "").toLowerCase())
    ),
  ];

  // UNE entrée par énergie (agrégée sur les équipements) — pour le graphe de
  // distribution et sa légende, sinon on affiche 7 barres "Electricity".
  // Triée par valeur décroissante : les énergies actives en premier.
  const energySummary = aggregateByEnergy(kpiSource).sort(
    (a, b) => Number(b.value || 0) - Number(a.value || 0)
  );

  // ── FACTURE ÉNERGÉTIQUE : plage de dates + génération PDF ─────────────────
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [invoiceStart, setInvoiceStart] = useState(monthAgo);
  const [invoiceEnd, setInvoiceEnd] = useState(today);
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [showInvoice, setShowInvoice] = useState(false); // panneau facture replié par défaut

  const loadInvoice = async () => {
    setInvoiceLoading(true);
    setInvoiceError("");
    try {
      const data = await fetchInvoice(invoiceStart, invoiceEnd, selectedLineLabel);
      setInvoiceData(data);
      return data;
    } catch (e) {
      setInvoiceError(e.message || "Failed to load invoice");
      return null;
    } finally {
      setInvoiceLoading(false);
    }
  };

  const printInvoice = async () => {
    const data = invoiceData || (await loadInvoice());
    if (!data) return;

    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const M = 14;
    let y = 0;

    const need = (n) => { if (y + n > pageH - 16) { pdf.addPage(); y = M; } };

    // En-tête facture
    pdf.setFillColor(22, 101, 52);
    pdf.rect(0, 0, pageW, 26, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16); pdf.setFont("helvetica", "bold");
    pdf.text("FACTURE ÉNERGÉTIQUE", M, 11);
    pdf.setFontSize(9); pdf.setFont("helvetica", "normal");
    pdf.text(`EMS Al Youssoufia  -  ${data.line}`, M, 18);
    pdf.text(`Période : ${data.start?.slice(0,10)}  ->  ${data.end?.slice(0,10)}`, M, 23);
    pdf.text(`Émise le : ${new Date().toLocaleDateString()}`, pageW - M, 18, { align: "right" });
    y = 36;

    // Montant total
    pdf.setFillColor(240, 253, 244);
    pdf.rect(M, y, pageW - 2 * M, 16, "F");
    pdf.setTextColor(22, 101, 52);
    pdf.setFontSize(11); pdf.setFont("helvetica", "bold");
    pdf.text("MONTANT TOTAL À PAYER", M + 3, y + 6);
    pdf.setFontSize(15);
    pdf.text(`${Number(data.total_cost || 0).toFixed(2)} MAD`, pageW - M - 3, y + 10, { align: "right" });
    y += 24;

    const drawTable = (title, rows) => {
      need(22);
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(11); pdf.setFont("helvetica", "bold");
      pdf.text(title, M, y); y += 5;
      pdf.setFillColor(226, 232, 240);
      pdf.rect(M, y, pageW - 2 * M, 7, "F");
      pdf.setFontSize(8);
      pdf.text("Désignation", M + 2, y + 4.8);
      pdf.text("Quantité", pageW - M - 55, y + 4.8);
      pdf.text("Coût (MAD)", pageW - M - 2, y + 4.8, { align: "right" });
      y += 7;
      pdf.setFont("helvetica", "normal");
      (rows || []).forEach((r, i) => {
        need(6);
        if (i % 2) { pdf.setFillColor(248, 250, 252); pdf.rect(M, y, pageW - 2 * M, 6, "F"); }
        pdf.text(String(r.name).slice(0, 42), M + 2, y + 4.2);
        pdf.text(`${Number(r.quantity).toFixed(1)} ${r.unit || ""}`, pageW - M - 55, y + 4.2);
        pdf.text(Number(r.cost).toFixed(2), pageW - M - 2, y + 4.2, { align: "right" });
        y += 6;
      });
      y += 8;
    };

    drawTable("Détail par type d'énergie", data.by_energy);
    drawTable("Détail par équipement", data.by_equipment);
    drawTable("Détail par zone", data.by_zone);
    if ((data.by_line || []).length > 1) drawTable("Détail par ligne de production", data.by_line);

    // Pied
    const pages = pdf.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7.5); pdf.setTextColor(120, 130, 150);
      pdf.text("EMS Al Youssoufia - Tarifs ONEE Maroc", M, pageH - 8);
      pdf.text(`Page ${i}/${pages}`, pageW - M, pageH - 8, { align: "right" });
    }

    pdf.save(`Facture_EMS_${data.start?.slice(0,10)}_${data.end?.slice(0,10)}.pdf`);
  };

  const [showShareModal, setShowShareModal] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareSuccess, setShareSuccess] = useState("");
  const [sharing, setSharing] = useState(false);

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

    const dataRows = physicalList.map((e) => [
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

    // "sep=;" indique a Excel le separateur : colonnes parfaitement alignees
    const csv = ["sep=;", ...[...metaRows, headers, ...dataRows].map((row) =>
      row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")
    )].join("\n");

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

  const handleExportPDF = async () => {
    // Telecharge le MEME PDF structure que celui envoye par "Share".
    const file = await generateReportPdf();
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getConvLabel = (conv) => {
    if (conv.type === "group") return conv.name || `Group #${conv.id}`;

    if (conv.participants?.length) {
      const names = conv.participants
        .map((p) =>
          `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.email || ""
        )
        .filter(Boolean);
      if (names.length) return names.join(", ");
    }

    return `Conversation #${conv.id}`;
  };

  // Genere un PDF STRUCTURE et professionnel (tableaux nets, pas une capture
  // ecran) - utilise PAR LES DEUX : "Export PDF" (telechargement) et "Share"
  // (envoye au destinataire). Le fichier recu est identique au fichier exporte.
  const generateReportPdf = async () => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const M = 14;
    const now = new Date();
    let y = 0;

    const newPageIfNeeded = (needed) => {
      if (y + needed > pageH - 16) {
        pdf.addPage();
        y = M;
      }
    };

    pdf.setFillColor(37, 99, 235);
    pdf.rect(0, 0, pageW, 24, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(15);
    pdf.setFont("helvetica", "bold");
    pdf.text("EMS - Energy Report", M, 10);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(`${selectedLineLabel}  -  Generated: ${now.toLocaleString()}`, M, 17);
    pdf.text("Al Youssoufia Plant", pageW - M, 17, { align: "right" });
    y = 33;

    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text("Key Performance Indicators", M, y);
    y += 6;
    pdf.setFontSize(9);
    const kpiPairs = [
      ["Operating Cost", `${Number(totalCost || 0).toFixed(2)} MAD`],
      ["Peak Demand", `${Number(peakKw || 0).toFixed(1)} kW`],
      ["Total CO2", `${Number(totalCo2 || 0).toFixed(3)} kg`],
      ["Cumulative Energy", `${Number(cumulativeKwh || 0).toFixed(1)} kWh`],
    ];
    kpiPairs.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = M + col * ((pageW - 2 * M) / 2);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${label}:`, x, y + row * 6);
      pdf.setFont("helvetica", "normal");
      pdf.text(value, x + 42, y + row * 6);
    });
    y += 18;

    const drawTable = (title, headers, rows, widths) => {
      newPageIfNeeded(24);
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(30, 41, 59);
      pdf.text(title, M, y);
      y += 5;
      pdf.setFillColor(226, 232, 240);
      pdf.rect(M, y, pageW - 2 * M, 7, "F");
      pdf.setFontSize(8);
      let hx = M + 2;
      headers.forEach((h, i) => {
        pdf.text(String(h), hx, y + 4.8);
        hx += widths[i];
      });
      y += 7;
      pdf.setFont("helvetica", "normal");
      rows.forEach((r, ri) => {
        newPageIfNeeded(7);
        if (ri % 2 === 1) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(M, y, pageW - 2 * M, 6, "F");
        }
        let cx = M + 2;
        r.forEach((cell, i) => {
          pdf.text(String(cell).slice(0, 40), cx, y + 4.2);
          cx += widths[i];
        });
        y += 6;
      });
      y += 9;
    };

    drawTable(
      "Energy Summary - aggregated per energy",
      ["Energy", "Value", "Unit", "Cost (MAD)", "CO2 (kg)", "Source"],
      energySummary.slice(0, 15).map((e) => [
        e.name,
        Number(e.value || 0).toFixed(2),
        e.unit || "-",
        Number(e.cost || 0).toFixed(2),
        Number(e.co2_kg || 0).toFixed(3),
        e.equipment || "-",
      ]),
      [42, 22, 16, 26, 24, 52]
    );

    drawTable(
      "Equipment Detail - latest readings",
      ["Equipment", "Area", "Energy", "Value", "Unit", "Cost (MAD)"],
      physicalList.slice(0, 40).map((e) => [
        e.rawData?.equipment || "-",
        e.rawData?.area || "-",
        e.name,
        Number(e.value || 0).toFixed(2),
        e.unit || "-",
        isCO2(e.name) ? "-" : Number(e.cost || 0).toFixed(2),
      ]),
      [48, 28, 38, 20, 16, 32]
    );

    const pages = pdf.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7.5);
      pdf.setTextColor(120, 130, 150);
      pdf.text(
        `EMS - Energy Management System  -  ${selectedLineLabel}  -  ${now.toLocaleDateString()}`,
        M,
        pageH - 8
      );
      pdf.text(`Page ${i} / ${pages}`, pageW - M, pageH - 8, { align: "right" });
    }

    const blob = pdf.output("blob");
    const fileName = `EMS_Report_${selectedLineLabel.replace(/ /g, "_")}_${now
      .toISOString()
      .slice(0, 10)}.pdf`;
    return new File([blob], fileName, { type: "application/pdf" });
  };

  const handleShare = async () => {
    if (!selectedConversationId) {
      setShareError("Please choose a conversation.");
      return;
    }

    const conversationId = Number(selectedConversationId);

    try {
      setShareError("");
      setSharing(true);

      const token = localStorage.getItem("token");

      // 1) On ferme d'abord la modale pour qu'elle n'apparaisse PAS dans le PDF,
      //    puis on attend deux frames que React redessine la page proprement.
      setShowShareModal(false);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );

      // 2) Generer le PDF de la page (sans la modale ni les boutons)
      const pdfFile = await generateReportPdf();

      // 3) L'envoyer dans la conversation choisie (endpoint upload existant)
      await uploadChatFile(conversationId, pdfFile, token);

      setSelectedConversationId("");
      setShareSuccess("Report (PDF) shared successfully.");

      setTimeout(() => setShareSuccess(""), 3000);
    } catch (e) {
      setShareError(e.message || "Failed to generate or share the PDF");
      setShowShareModal(true);
    } finally {
      setSharing(false);
    }
  };
  const totalKw = energies
    .filter((e) => e.unit === "kW")
    .reduce((s, e) => s + e.value, 0);

  const realTotalCost =
    totalCost > 0
      ? totalCost
      : kpiSource
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

          <button
            type="button"
            onClick={() => setShowInvoice((v) => !v)}
            style={{
              background: showInvoice ? "#64748b" : "#16a34a",
              color: "#fff", border: "none", borderRadius: "8px",
              padding: "0.55rem 1rem", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem",
            }}
          >
            {showInvoice ? "✕ Fermer facture" : "🧾 Facture"}
          </button>
        </div>
      </div>

      {shareSuccess && <div className="info-box">{shareSuccess}</div>}
      {shareError && <div className="alarm-item">{shareError}</div>}

      {/* ── FACTURE ÉNERGÉTIQUE (repliable via le bouton du header) ──────── */}
      {showInvoice && (
      <section className="section-block no-print">
        <div className="panel-card" style={{ borderLeft: "4px solid #16a34a" }}>
          <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2>🧾 Facture énergétique</h2>
              <p>Coût des énergies consommées sur une période — {selectedLineLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => { setShowInvoice(false); setInvoiceData(null); setInvoiceError(""); }}
              title="Fermer la facture"
              style={{
                background: "transparent", border: "1px solid var(--border-color)",
                borderRadius: "8px", width: 32, height: 32, cursor: "pointer",
                color: "var(--text-secondary)", fontSize: "1rem", flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "3px", color: "var(--text-secondary)" }}>Date début</label>
              <input type="date" value={invoiceStart} max={invoiceEnd}
                onChange={(e) => setInvoiceStart(e.target.value)}
                style={{ padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: "3px", color: "var(--text-secondary)" }}>Date fin</label>
              <input type="date" value={invoiceEnd} min={invoiceStart} max={today}
                onChange={(e) => setInvoiceEnd(e.target.value)}
                style={{ padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} />
            </div>
            <button type="button" onClick={loadInvoice} disabled={invoiceLoading}
              style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "0.55rem 1.1rem", cursor: "pointer", fontWeight: 600 }}>
              {invoiceLoading ? "…" : "🔍 Calculer"}
            </button>
            <button type="button" onClick={printInvoice} disabled={invoiceLoading}
              style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: "8px", padding: "0.55rem 1.1rem", cursor: "pointer", fontWeight: 700 }}>
              🖨️ Imprimer la facture (PDF)
            </button>
          </div>

          {invoiceError && <div className="alarm-item">⚠ {invoiceError}</div>}

          {invoiceData && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#f0fff4", border: "1px solid #c6f6d5", borderRadius: "10px",
                padding: "0.8rem 1.2rem", marginBottom: "1rem" }}>
                <span style={{ fontWeight: 700, color: "#16a34a" }}>MONTANT TOTAL À PAYER</span>
                <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16a34a" }}>
                  {Number(invoiceData.total_cost || 0).toFixed(2)} MAD
                </span>
              </div>

              <div className="two-column-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                {[
                  { title: "Par énergie", rows: invoiceData.by_energy },
                  { title: "Par équipement", rows: invoiceData.by_equipment },
                  { title: "Par zone", rows: invoiceData.by_zone },
                  { title: "Par ligne", rows: invoiceData.by_line },
                ].map((b) => (
                  <div key={b.title} className="table-card">
                    <div className="section-title-wrap"><h3 style={{ fontSize: "0.9rem" }}>{b.title}</h3></div>
                    <table>
                      <thead><tr><th>Désignation</th><th style={{ textAlign: "right" }}>Coût (MAD)</th></tr></thead>
                      <tbody>
                        {(b.rows || []).slice(0, 10).map((r) => (
                          <tr key={r.name}>
                            <td>{r.name}</td>
                            <td style={{ textAlign: "right", fontWeight: 600, color: "#16a34a" }}>{Number(r.cost).toFixed(2)}</td>
                          </tr>
                        ))}
                        {(!b.rows || b.rows.length === 0) && (
                          <tr><td colSpan="2" style={{ textAlign: "center", color: "var(--text-secondary)" }}>Aucune donnée facturable</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      )}

      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Executive Summary</h2>
          <p>Key performance indicators — {selectedLineLabel}</p>
        </div>

        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Current Operating Cost</h4>
            <strong style={{ color: "#d69e2e" }}>{toMAD(realTotalCost)}</strong>
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
          <p>One row per equipment — {selectedLineLabel}</p>
        </div>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Zone</th>
                <th>Power (kW)</th>
                <th>Energy (kWh)</th>
                <th>Main Measure</th>
                <th>Voltage</th>
                <th>Power Factor</th>
                <th>Cost (MAD)</th>
                <th>CO₂ (kg)</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>

            <tbody>
              {/* UNE ligne par équipement physique : coût/CO₂ = somme de
                  toutes ses mesures facturables (eau, fuel, vapeur incluses) */}
              {energies.length > 0 ? (
                groupByEquipment(energies).map((eq) => {
                  const st =
                    eq.kw != null
                      ? eq.kw > 1
                        ? { label: "Running", color: "#38a169" }
                        : eq.kw > 0.1
                        ? { label: "Standby", color: "#d69e2e" }
                        : { label: "Off", color: "#e53e3e" }
                      : eq.primary
                      ? eq.primary.value > 0
                        ? { label: "Active", color: "#38a169" }
                        : { label: "Idle", color: "#d69e2e" }
                      : eq.kwh != null
                      ? { label: "Metering", color: "#38a169" }
                      : { label: "Unknown", color: "#888" };

                  return (
                    <tr key={eq.name}>
                      <td><strong>{eq.name}</strong></td>
                      <td>{eq.area}</td>
                      <td>{eq.kw != null ? <strong>{eq.kw.toFixed(2)}</strong> : "—"}</td>
                      <td>{eq.kwh != null ? eq.kwh.toFixed(2) : "—"}</td>
                      <td>
                        {eq.primary
                          ? `${eq.primary.value.toFixed(1)} ${eq.primary.unit} · ${eq.primary.name}`
                          : "—"}
                      </td>
                      <td>
                        {eq.voltage != null ? (
                          <span style={{ color: eq.voltage >= 210 ? "#38a169" : "#e53e3e" }}>
                            {eq.voltage.toFixed(1)} V
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {eq.power_factor != null ? (
                          <span style={{ color: eq.power_factor >= 0.9 ? "#38a169" : "#e53e3e" }}>
                            {eq.power_factor.toFixed(3)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ color: "#d69e2e", fontWeight: 600 }}>
                        {toMAD(eq.cost || 0)}
                      </td>
                      <td style={{ color: "#38a169" }}>
                        {Number(eq.co2 || 0).toFixed(3)}
                      </td>
                      <td>
                        <span style={{ color: st.color }}><strong>{st.label}</strong></span>
                      </td>
                      <td style={{ fontSize: "0.78rem", color: "#888" }}>
                        {eq.timestamp ? new Date(eq.timestamp).toLocaleTimeString() : "—"}
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

      <div className="two-column-layout">
        <section className="panel-card">
          <div className="panel-head">
            <div>
              <h2>Consumption Distribution</h2>
            </div>
          </div>

          <PrintableBarChart energies={energySummary.slice(0, 5)} />

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              marginTop: "0.5rem",
            }}
          >
            {energySummary.slice(0, 5).map((e, i) => (
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
          {/* UNE carte par énergie FACTURABLE, coût agrégé sur tous les
              équipements (Water et Fuel ne restent plus à 0) */}
          {energySummary.filter((e) => !isCO2(e.name) && Number(e.cost || 0) > 0).length > 0 ? (
            energySummary
              .filter((e) => !isCO2(e.name) && Number(e.cost || 0) > 0)
              .map((e) => (
                <div className="carbon-card" key={`${e.name}-${e.unit}`}>
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
                    {e.equipment && ` · ${e.equipment}`}
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
              <button
                type="button"
                className="login-btn"
                onClick={handleShare}
                disabled={sharing}
              >
                {sharing ? "Generating PDF…" : "Share"}
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