// ─── Agrégation des mesures par ÉNERGIE ───────────────────────────────────────
// La DataPlatform envoie une mesure par équipement (7 PM ⇒ 7 × "Electricity").
// Pour les sections "par énergie" des pages, on agrège : UNE entrée par
// énergie — somme pour les consommations/débits, moyenne pour les mesures
// de qualité (°C, bar, %, facteur de puissance…).

export const SUMMABLE_UNITS = new Set([
  "kW", "kWh", "kVAR", "kVA", "m³", "m³/h", "t/h", "tonne", "L", "L/h", "kgCO2", "kg",
]);

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
