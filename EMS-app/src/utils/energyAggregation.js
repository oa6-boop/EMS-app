// ─── Agrégation des mesures par ÉNERGIE ───────────────────────────────────────
// La DataPlatform envoie une mesure par équipement (7 PM ⇒ 7 × "Electricity").
// Pour les sections "par énergie" des pages, on agrège : UNE entrée par
// énergie — somme pour les consommations/débits, moyenne pour les mesures
// de qualité (°C, bar, %, facteur de puissance…).

export const SUMMABLE_UNITS = new Set([
  "kW", "kWh", "kVAR", "kVA", "m³", "m³/h", "t/h", "tonne", "L", "L/h", "kgCO2", "kg",
]);

// ─── Rollups d'agrégation (PAS des équipements physiques) ────────────────────
// Même règle que le backend (app/utils.py::is_aggregate_rollup) :
//  - zone « Line Total » → totaux de ligne (Total, Total water consumption)
//  - équipement portant le nom de sa zone → total de zone (Extraction…)
// À exclure des tableaux/listes équipement ET des sommes par énergie
// (sinon double comptage : le rollup contient déjà la somme des équipements).
export function isAggregateRollup(e = {}) {
  const area = String(e.area || e.zone || e.rawData?.area || "").trim().toLowerCase();
  const eq = String(e.equipment || e.rawData?.equipment || "").trim().toLowerCase();
  return area === "line total" || (eq !== "" && eq === area);
}

// Mesures réelles uniquement (équipements physiques, sans rollups).
export function physicalEnergies(energies = []) {
  return energies.filter((e) => !isAggregateRollup(e));
}

// ─── UNE ligne par ÉQUIPEMENT (pour les tableaux) ────────────────────────────
// Regroupe toutes les mesures d'un équipement : kW, kWh, mesure procédé
// principale, qualité (V / PF / Hz / THD), et TOTAUX coût + CO₂ (somme de
// toutes ses mesures facturables → l'eau du débitmètre et le fuel du compteur
// ne restent plus à 0). 12 équipements = 12 lignes.
export function groupByEquipment(energies = []) {
  const map = new Map();
  physicalEnergies(energies).forEach((e) => {
    const name = e.equipment || e.rawData?.equipment;
    if (!name) return;
    const g = map.get(name) || {
      name,
      area: e.area || e.zone || e.rawData?.area || "—",
      plant: e.plant || e.rawData?.plant || "—",
      unit_name: e.rawData?.unit_name || e.unit_name || "—",
      line: e.line || "",
      kw: null, kwh: null, voltage: null, power_factor: null,
      frequency: null, thd: null, primary: null,
      cost: 0, co2: 0, timestamp: null, measures: 0,
    };
    g.measures += 1;
    if (e.unit === "kW") g.kw = Number(e.value || 0);
    if (e.unit === "kWh") g.kwh = Number(e.value || 0);
    const raw = e.rawData || e;
    if (raw.voltage != null) g.voltage = Number(raw.voltage);
    if (raw.power_factor != null) g.power_factor = Number(raw.power_factor);
    if (raw.frequency != null) g.frequency = Number(raw.frequency);
    if (raw.thd != null) g.thd = Number(raw.thd);
    g.cost += Number(e.cost || 0);
    g.co2 += Number(e.co2_kg || 0);
    if (e.timestamp && (!g.timestamp || new Date(e.timestamp) > new Date(g.timestamp))) {
      g.timestamp = e.timestamp;
    }
    const nm = String(e.name || "").toLowerCase();
    const isTechnical = /voltage|current|frequency|power factor|thd|breaker|co2|co₂|reactive|apparent|\bsec\b|specific energy/.test(nm);
    if (e.unit !== "kW" && e.unit !== "kWh" && !isTechnical && !g.primary && e.value != null) {
      g.primary = { name: e.name, value: Number(e.value || 0), unit: e.unit };
    }
    map.set(name, g);
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function aggregateByEnergy(energies = []) {
  const byEnergy = new Map();

  energies.forEach((e) => {
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

  return [...byEnergy.values()].map((e) => ({
    ...e,
    value: SUMMABLE_UNITS.has(e.unit || "") ? e.value : e.value / e.count,
    equipment: e.count > 1 ? `${e.count} equipment` : e.equipment,
  }));
}
