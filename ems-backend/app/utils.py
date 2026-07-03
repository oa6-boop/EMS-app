"""
utils.py — Calcul automatique des coûts MAD pour toutes les énergies
"""
import random
import string
from collections import defaultdict

CO2_FACTOR_KG_PER_KWH = 0.718  # ONEE Maroc

ENERGY_RATES_MASTER = {
    "electricity": 1.40,
    "electricity-kwh": 1.40,
    "electricity-kw": 1.40,
    "electricity (kwh)": 1.40,
    "electricity (kw)": 1.40,
    "electricite": 1.40,
    "électricité": 1.40,
    "electricité": 1.40,
    "elec": 1.40,
    "electric": 1.40,
    "electrical": 1.40,
    "power": 1.40,
    "energie": 1.40,
    "énergie": 1.40,
    "energy": 1.40,
    "kwh": 1.40,
    "kw": 1.40,
    "active_power": 1.40,
    "active power": 1.40,
    "consommation": 1.40,
    "consumption": 1.40,
    "puissance": 1.40,
    "puissance active": 1.40,

    "co2": 0.0,
    "co₂": 0.0,
    "co2-emissions": 0.0,
    "co2 emissions": 0.0,
    "co2-kg": 0.0,
    "carbon": 0.0,
    "carbon emissions": 0.0,
    "emission": 0.0,
    "emissions": 0.0,
    "ghg": 0.0,
    "greenhouse gas": 0.0,
    "gaz à effet de serre": 0.0,

    "water": 9.0,
    "eau": 9.0,
    "water-m3": 9.0,
    "eau-m3": 9.0,
    "water (m3)": 9.0,
    "water consumption": 9.0,
    "consommation eau": 9.0,
    "h2o": 9.0,
    "cold water": 9.0,
    "eau froide": 9.0,
    "hot water": 12.0,
    "eau chaude": 12.0,

    "steam": 120.0,
    "vapeur": 120.0,
    "steam-tonne": 120.0,
    "vapeur-tonne": 120.0,
    "steam (tonne)": 120.0,
    "industrial steam": 120.0,
    "vapeur industrielle": 120.0,
    "high pressure steam": 135.0,
    "vapeur hp": 135.0,
    "low pressure steam": 110.0,
    "vapeur bp": 110.0,

    "fuel": 13.5,
    "carburant": 13.5,
    "diesel": 13.5,
    "gasoil": 13.5,
    "fuel-l": 13.5,
    "fuel (l)": 13.5,
    "fuel oil": 14.0,
    "fioul": 14.0,
    "mazout": 14.0,
    "gasoline": 15.0,
    "essence": 15.0,

    "gas": 8.5,
    "gaz": 8.5,
    "natural gas": 8.5,
    "gaz naturel": 8.5,
    "gas-m3": 8.5,
    "lpg": 10.0,
    "gpl": 10.0,
    "butane": 10.0,
    "propane": 11.0,

    "solar": 0.50,
    "solaire": 0.50,
    "solar energy": 0.50,
    "énergie solaire": 0.50,
    "photovoltaic": 0.50,
    "photovoltaïque": 0.50,
    "pv": 0.50,
    "solar power": 0.50,

    "compressed air": 0.025,
    "air comprimé": 0.025,
    "air comprime": 0.025,
    "compressed-air": 0.025,
    "air": 0.025,

    "nitrogen": 2.5,
    "azote": 2.5,
    "n2": 2.5,

    "hydrogen": 25.0,
    "hydrogène": 25.0,
    "h2": 25.0,
    "green hydrogen": 30.0,
    "hydrogène vert": 30.0,


    "sec": 0.0,
    "specific energy consumption": 0.0,
    "sec-kwh-per-unit": 0.0,
    "flow rate": 0.0,
    "flow-rate": 0.0,
    "instant flow": 0.0,
    "production quantity": 0.0,
    "production": 0.0,
    "frequency": 0.0,
    "voltage": 0.0,
    "current": 0.0,
    "power factor": 0.0,
    "thd": 0.0,
    "thd voltage": 0.0,
    "thd current": 0.0,
    "reactive power": 0.0,
    "apparent power": 0.0,
    "temperature": 0.0,
    "pressure": 0.0,
    "coal": 2.5,
    "charbon": 2.5,
    "coke": 3.0,
}

KEYWORD_RATES = [
    (["co2", "co₂", "carbon", "emission", "ghg"], 0.0),

    (["sec", "specific energy", "flow", "production", "frequency", "voltage", "current", "power factor", "thd", "reactive", "apparent", "temperature", "pressure"], 0.0),
    (
        [
            "electric",
            "électric",
            "kwh",
            "kw",
            "power",
            "energie",
            "énergie",
            "energy",
            "elec",
            "consomm",
            "puissance",
        ],
        1.40,
    ),
    (["hot water", "eau chaude"], 12.0),
    (["steam", "vapeur"], 120.0),
    (["water", "eau", "h2o"], 9.0),
    (["solar", "solaire", "photovolt", "pv"], 0.50),
    (["diesel", "gasoil", "carburant", "fioul", "mazout", "gasolin", "essence", "fuel"], 13.5),
    (["natural gas", "gaz naturel"], 8.5),
    (["lpg", "gpl", "butane", "propane"], 10.0),
    (["gas", "gaz"], 8.5),
    (["compressed air", "air comprim"], 0.025),
    (["nitrogen", "azote"], 2.5),
    (["hydrogen", "hydrogène"], 25.0),
    (["coal", "charbon", "coke"], 2.5),
]


def normalize_line_name(line_name: str) -> str:
    """Normalise le nom de ligne de production."""
    return (line_name or "").strip()


def normalize_energy_name(name: str) -> str:
    """
    Normalise le nom d'énergie venant du DataPlatform.
    Conserve le nom original propre.
    Le matching des tarifs se fait dans get_rate_for_energy().
    """
    if not name:
        return name
    return name.strip()


def get_rate_for_energy(energy_name: str, db=None) -> float:
    """
    Retourne le taux MAD pour n'importe quel nom d'énergie.
    Priorité : DB admin → dictionnaire exact → matching partiel → défaut
    """
    if not energy_name:
        return 0.0

    name_clean = energy_name.strip().lower().replace("_", " ")

    if db is not None:
        try:
            from app.models import EnergyRate

            rate_obj = (
                db.query(EnergyRate)
                .filter(EnergyRate.energy_name.ilike(f"%{energy_name}%"))
                .first()
            )

            if rate_obj:
                return float(rate_obj.rate_mad)
        except Exception:
            pass

    rate = ENERGY_RATES_MASTER.get(name_clean)
    if rate is not None:
        return rate

    for keywords, rate in KEYWORD_RATES:
        if any(k in name_clean for k in keywords):
            return rate

    return 0.0


def calculate_cost(energy_name: str, value: float, db=None) -> float:
    """Calcule le coût en MAD automatiquement."""
    if not energy_name or value is None:
        return 0.0

    rate = get_rate_for_energy(energy_name, db)
    return round(float(value) * rate, 4)


def calculate_co2(energy_name: str, value: float, unit: str) -> float:
    name_lower = (energy_name or "").lower()
    unit_lower = (unit or "").lower()

    if any(k in name_lower for k in ["co2", "co₂", "emission", "carbon"]):
        return round(float(value), 3)

    if unit_lower == "kwh" or "kwh" in name_lower or "electric" in name_lower:
        return round(float(value) * CO2_FACTOR_KG_PER_KWH, 3)

    return 0.0


def generate_temp_password(length: int = 10) -> str:
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def get_latest_per_line_and_energy(records):
    """
    Keep the latest value for each line + equipment + energy + unit.
    This avoids losing meters when several meters publish the same energy type
    on the same production line.
    """
    latest = {}

    for record in records:
        key = (
            record.production_line,
            record.equipment,
            record.energy_name,
            record.unit,
        )

        if key not in latest or record.timestamp > latest[key].timestamp:
            latest[key] = record

    return latest


def build_dashboard_summary(records):
    latest = get_latest_per_line_and_energy(records)

    grouped = defaultdict(
        lambda: {
            "energies": [],
            "total_cost": 0.0,
            "total_co2_kg": 0.0,
            "peak_kw": 0.0,
            "avg_voltage": None,
            "avg_power_factor": None,
        }
    )

    for _, record in latest.items():
        cost = calculate_cost(record.energy_name, record.value)
        co2_kg = calculate_co2(record.energy_name, record.value, record.unit)
        rate = get_rate_for_energy(record.energy_name)

        grouped[record.production_line]["energies"].append(
            {
                "id": record.id,
                "energy_name": record.energy_name,
                "value": record.value,
                "unit": record.unit,
                "cost": cost,
                "rate_mad": rate,
                "co2_kg": co2_kg,
                "timestamp": record.timestamp.isoformat(),
                "plant": getattr(record, "plant", "Plant 1"),
                "unit_name": getattr(record, "unit_name", "Unit 1"),
                "area": getattr(record, "area", "Area 1"),
                "equipment": getattr(record, "equipment", "Equipment 1"),
                "voltage": getattr(record, "voltage", None),
                "frequency": getattr(record, "frequency", None),
                "power_factor": getattr(record, "power_factor", None),
                "thd": getattr(record, "thd", None),
                "tags": getattr(record, "tags", None),
            }
        )

        grouped[record.production_line]["total_cost"] += cost
        grouped[record.production_line]["total_co2_kg"] += co2_kg

        if record.unit == "kW" and record.value > grouped[record.production_line]["peak_kw"]:
            grouped[record.production_line]["peak_kw"] = record.value

    for line_name in grouped:
        line = grouped[line_name]

        line["energies"].sort(key=lambda x: x["energy_name"])
        line["total_cost"] = round(line["total_cost"], 4)
        line["total_co2_kg"] = round(line["total_co2_kg"], 3)
        line["peak_kw"] = round(line["peak_kw"], 2)

        voltages = [
            e["voltage"] for e in line["energies"] if e["voltage"] is not None
        ]

        pf_values = [
            e["power_factor"]
            for e in line["energies"]
            if e["power_factor"] is not None
        ]

        if voltages:
            line["avg_voltage"] = round(sum(voltages) / len(voltages), 1)

        if pf_values:
            line["avg_power_factor"] = round(sum(pf_values) / len(pf_values), 3)

    return grouped


def build_industry_kpis(records, alarms):
    if not records:
        return {
            "total_records": 0,
            "total_cost": 0,
            "total_co2_kg": 0,
            "highest_energy": None,
            "lowest_energy": None,
            "active_alarms": len([a for a in alarms if a.status == "active"]),
            "peak_demand": 0,
        }

    total_cost = 0.0
    total_co2 = 0.0
    peak = 0.0
    highest = None
    lowest = None

    for record in records:
        cost = calculate_cost(record.energy_name, record.value)
        co2_kg = calculate_co2(record.energy_name, record.value, record.unit)

        total_cost += cost
        total_co2 += co2_kg

        if highest is None or record.value > highest.value:
            highest = record

        if lowest is None or record.value < lowest.value:
            lowest = record

        if record.value > peak:
            peak = record.value

    return {
        "total_records": len(records),
        "total_cost": round(total_cost, 2),
        "total_co2_kg": round(total_co2, 3),
        "highest_energy": {
            "name": highest.energy_name,
            "value": highest.value,
            "unit": highest.unit,
            "line": highest.production_line,
        }
        if highest
        else None,
        "lowest_energy": {
            "name": lowest.energy_name,
            "value": lowest.value,
            "unit": lowest.unit,
            "line": lowest.production_line,
        }
        if lowest
        else None,
        "active_alarms": len([a for a in alarms if a.status == "active"]),
        "peak_demand": round(peak, 2),
    }