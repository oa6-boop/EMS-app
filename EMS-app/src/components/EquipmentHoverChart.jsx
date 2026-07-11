import { useState } from "react";
import { fetchLineHistory } from "../api/emsApi";
import { getCached, setCached } from "../utils/pageCache.js";

// ─── Tooltip-graphe au survol d'un équipement ─────────────────────────────────
// Enrobe une carte équipement (Dashboard, Equipment Status) : au survol,
// affiche une étiquette flottante avec la mini-courbe de consommation (kW)
// de CET équipement — historique réel tiré de la DataPlatform.
// L'historique de la ligne est chargé une fois puis mis en cache 30 s.

const TTL_MS = 30000;

async function getLineHistory(line) {
  const key = `eqspark_${line}`;
  const cached = getCached(key, null);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.records;
  try {
    const records = await fetchLineHistory(line, 400);
    setCached(key, { at: Date.now(), records: records || [] });
    return records || [];
  } catch {
    return cached ? cached.records : [];
  }
}

function Sparkline({ series }) {
  const W = 210, H = 54, P = 4;
  const values = series.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const rng = maxV - minV || 1;
  const toX = (i) => P + (i * (W - P * 2)) / Math.max(values.length - 1, 1);
  const toY = (v) => H - P - ((v - minV) / rng) * (H - P * 2);
  const pts = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      <polyline
        points={`${P},${H - P} ${pts} ${toX(values.length - 1).toFixed(1)},${H - P}`}
        fill="rgba(37, 99, 235, 0.10)"
        stroke="none"
      />
      <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={toX(values.length - 1)} cy={toY(last)} r="2.6"
        fill="#2563eb" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

export default function EquipmentHoverChart({ line, equipment, children }) {
  const [visible, setVisible] = useState(false);
  const [series, setSeries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [metric, setMetric] = useState({ name: "Power", unit: "kW" });

  const handleEnter = async () => {
    setVisible(true);
    setLoaded(false);
    const records = await getLineHistory(line);
    const mine = records.filter((r) => r.equipment === equipment);

    // 1) Priorité au kW (équipements électriques). 2) Sinon, la mesure la plus
    //    fréquente de l'appareil (débit, production, vapeur, eau…).
    let picked = mine.filter((r) => r.unit === "kW");
    if (picked.length < 2) {
      const byName = {};
      mine.forEach((r) => { (byName[r.energy_name] = byName[r.energy_name] || []).push(r); });
      const best = Object.values(byName).sort((a, b) => b.length - a.length)[0];
      if (best && best.length >= 2) picked = best;
    }

    if (picked.length) {
      setMetric({ name: picked[0].energy_name || "Value", unit: picked[0].unit || "" });
    }
    setSeries(
      picked.slice(0, 40).reverse().map((r) => ({ value: Number(r.value || 0), t: r.timestamp }))
    );
    setLoaded(true);
  };

  const last = series.length ? series[series.length - 1] : null;
  const values = series.map((p) => p.value);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 0;

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setVisible(false)}
    >
      {children}

      {visible && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            width: 240,
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid #2563eb",
            borderRadius: 10,
            padding: "10px 12px",
            zIndex: 50,
            pointerEvents: "none",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.35)",
          }}
        >
          <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#93c5fd", marginBottom: 4 }}>
            ⚡ {equipment} — {metric.name} ({metric.unit})
          </div>

          {series.length > 1 ? (
            <>
              <Sparkline series={series} />
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: "0.7rem", color: "#cbd5e1", marginTop: 4,
              }}>
                <span>min {minV.toFixed(1)}</span>
                <span style={{ color: "#fff", fontWeight: 700 }}>
                  now {last ? last.value.toFixed(1) : "—"} {metric.unit}
                </span>
                <span>max {maxV.toFixed(1)}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: "0.72rem", color: "#cbd5e1", padding: "6px 0" }}>
              {!loaded ? "Loading history…" : "No history yet for this device"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
