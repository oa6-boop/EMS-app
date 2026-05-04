export const initialData = {
  tension: 415,
  frequence: 50,
  facteurPuissance: 0.94,
  thd: 3.2,
  temperature: 26,
  humidite: 58,
};

export const energyCatalog = [
  {
    id: 1,
    name: "Électricité",
    aliases: ["electricite", "électricité", "electricity", "power"],
    unit: "kWh",
    min: 42000,
    max: 48000,
    step: 120,
    chartMin: 50,
    chartMax: 90,
  },
  {
    id: 2,
    name: "Eau",
    aliases: ["eau", "water"],
    unit: "m³",
    min: 1100,
    max: 1500,
    step: 25,
    chartMin: 30,
    chartMax: 60,
  },
  {
    id: 3,
    name: "CO₂",
    aliases: ["co2", "co₂", "carbon", "carbon emissions"],
    unit: "tCO₂e",
    min: 10,
    max: 25,
    step: 0.8,
    chartMin: 10,
    chartMax: 25,
  },
  {
    id: 4,
    name: "Vapeur",
    aliases: ["vapeur", "steam"],
    unit: "t",
    min: 250,
    max: 380,
    step: 12,
    chartMin: 40,
    chartMax: 80,
  },
  {
    id: 5,
    name: "Énergie Solaire",
    aliases: ["solaire", "solar", "solar energy", "photovoltaic", "pv"],
    unit: "kWh",
    min: 120,
    max: 700,
    step: 35,
    chartMin: 20,
    chartMax: 75,
  },
  {
    id: 11,
    name: "Fuel",
    aliases: ["fuel", "carburant", "fuel energy"],
    unit: "L",
    min: 300,
    max: 1500,
    step: 30,
    chartMin: 20,
    chartMax: 70,
  },
];

export function createInitialEnergy(def) {
  if (!def) return null;

  return {
    id: def.id || Date.now(),
    name: def.name,
    unit: def.unit,
    value: Number(((def.min + def.max) / 2).toFixed(2)),
    min: def.min,
    max: def.max,
    step: def.step,
    chartMin: def.chartMin,
    chartMax: def.chartMax,
    chart: Array.from({ length: 10 }, () =>
      Math.floor(def.chartMin + Math.random() * (def.chartMax - def.chartMin))
    ),
  };
}

export const initialEnergies = energyCatalog.map((energy) =>
  createInitialEnergy(energy)
);

export function generateData(prev) {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  return {
    ...prev,
    tension: clamp(prev.tension + (Math.random() * 2 - 1.1), 410, 420),
    frequence: clamp(prev.frequence + (Math.random() * 0.08 - 0.04), 49.8, 50.2),
    facteurPuissance: clamp(
      prev.facteurPuissance + (Math.random() * 0.02 - 0.01),
      0.88,
      0.99
    ),
    thd: clamp(prev.thd + (Math.random() * 0.3 - 0.15), 2.5, 5.5),
    temperature: clamp(prev.temperature + (Math.random() * 1.2 - 0.6), 20, 34),
    humidite: clamp(prev.humidite + (Math.random() * 2 - 1), 45, 70),
  };
}

export function generateEnergyValue(energy) {
  const next =
    energy.value + (Math.random() * energy.step * 2 - energy.step);
  return Number(Math.min(energy.max, Math.max(energy.min, next)).toFixed(2));
}

export function generateEnergyChartValue(energy) {
  const min = energy.chartMin ?? 10;
  const max = energy.chartMax ?? 90;
  return Math.floor(min + Math.random() * (max - min));
}