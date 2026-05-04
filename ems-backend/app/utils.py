"""
utils.py — Utilitaires EMS
CORRECTION:
  - Normalisation des noms d'énergie: fusionne les variantes (CO₂/CO2, Électricité/Electricity)
  - Ne garde QUE les données de source DataPlatform (Modbus)
"""

import random
import string
from collections import defaultdict

CO2_FACTOR_KG_PER_KWH = 0.718  # ONEE Maroc

ENERGY_COST_RATES = {
    # Électricité kW
    "Electricity":     0.14,
    "electricity":     0.14,
    # Électricité kWh
    "Electricity-kWh": 0.14,
    "electricity-kwh": 0.14,
    # CO2 — pas de coût monétaire
    "CO2-Emissions":   0.0,
    "co2-emissions":   0.0,
    "CO2":             0.0,
    "co2":             0.0,
    "CO₂":             0.0,
    # Eau
    "Eau":   0.90,
    "Water": 0.90,
    # Vapeur
    "Vapeur": 12.0,
    "Steam":  12.0,
    # Carburant
    "Fuel":      1.35,
    "Carburant": 1.35,
    # Solaire
    "Solar":           0.05,
    "Énergie Solaire": 0.05,
    # Électricité variantes françaises
    "Électricité": 0.14,
}

# ─── Normalisation des noms d'énergie ────────────────────────────────────────
# Fusionne les variantes pour éviter les doublons dans l'affichage
ENERGY_NAME_NORMALIZE = {
    # CO2 — toutes les variantes → "CO₂ Emissions"
    "co2-emissions":  "CO₂ Emissions",
    "co2 emissions":  "CO₂ Emissions",
    "co2":            "CO₂ Emissions",
    "co₂":            "CO₂ Emissions",
    "carbon":         "CO₂ Emissions",
    # Électricité kW
    "electricity":    "Electricity (kW)",
    "électricité":    "Electricity (kW)",
    # Électricité kWh — garder séparé
    "electricity-kwh": "Electricity (kWh)",
    "electricite-kwh": "Electricity (kWh)",
}


def normalize_energy_name(name: str) -> str:
    """
    Normalise le nom d'énergie pour éviter les doublons.
    Exemples:
      'CO2-Emissions' → 'CO₂ Emissions'
      'electricity'   → 'Electricity (kW)'
      'Electricity-kWh' → 'Electricity (kWh)'
    """
    if not name:
        return name
    key = name.strip().lower().replace("_", "-").replace(" ", "-")
    return ENERGY_NAME_NORMALIZE.get(key, name.strip())


def normalize_line_name(line_name: str) -> str:
    return (line_name or "").strip()


def generate_temp_password(length: int = 10) -> str:
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def calculate_cost(energy_name: str, value: float) -> float:
    if not energy_name:
        return 0.0
    rate = ENERGY_COST_RATES.get(energy_name)
    if rate is None:
        rate = ENERGY_COST_RATES.get(energy_name.lower(), 0.0)
    return round(float(value) * rate, 4)


def calculate_co2(energy_name: str, value: float, unit: str) -> float:
    name_lower = (energy_name or "").lower()
    unit_lower = (unit or "").lower()
    if "co2" in name_lower or "co₂" in name_lower or "kgco2" in unit_lower:
        return round(float(value), 3)
    if unit_lower == "kwh" or "kwh" in name_lower:
        return round(float(value) * CO2_FACTOR_KG_PER_KWH, 3)
    return 0.0


def get_latest_per_line_and_energy(records):
    latest = {}
    for record in records:
        # Ignorer les données du simulateur backend
        if getattr(record, "source", "") == "simulator":
            continue
        key = (record.production_line, record.energy_name)
        if key not in latest or record.timestamp > latest[key].timestamp:
            latest[key] = record
    return latest


def build_dashboard_summary(records):
    latest  = get_latest_per_line_and_energy(records)
    grouped = defaultdict(lambda: {
        "energies": [], "total_cost": 0.0,
        "total_co2_kg": 0.0, "peak_kw": 0.0,
        "avg_voltage": None, "avg_power_factor": None,
    })

    for _, record in latest.items():
        cost   = calculate_cost(record.energy_name, record.value)
        co2_kg = calculate_co2(record.energy_name, record.value, record.unit)

        grouped[record.production_line]["energies"].append({
            "id":           record.id,
            "energy_name":  record.energy_name,
            "value":        record.value,
            "unit":         record.unit,
            "cost":         cost,
            "co2_kg":       co2_kg,
            "timestamp":    record.timestamp.isoformat(),
            "plant":        getattr(record, "plant",        "Plant 1"),
            "unit_name":    getattr(record, "unit_name",    "Unit 1"),
            "area":         getattr(record, "area",         "Area 1"),
            "equipment":    getattr(record, "equipment",    "Equipment 1"),
            "voltage":      getattr(record, "voltage",      None),
            "frequency":    getattr(record, "frequency",    None),
            "power_factor": getattr(record, "power_factor", None),
            "thd":          getattr(record, "thd",          None),
        })
        grouped[record.production_line]["total_cost"]   += cost
        grouped[record.production_line]["total_co2_kg"] += co2_kg

        if record.unit == "kW" and record.value > grouped[record.production_line]["peak_kw"]:
            grouped[record.production_line]["peak_kw"] = record.value

    for line_name in grouped:
        line = grouped[line_name]
        line["energies"].sort(key=lambda x: x["energy_name"])
        line["total_cost"]   = round(line["total_cost"],   4)
        line["total_co2_kg"] = round(line["total_co2_kg"], 3)
        line["peak_kw"]      = round(line["peak_kw"],      2)

        voltages  = [e["voltage"]      for e in line["energies"] if e["voltage"]      is not None]
        pf_values = [e["power_factor"] for e in line["energies"] if e["power_factor"] is not None]
        if voltages:
            line["avg_voltage"]      = round(sum(voltages)  / len(voltages),  1)
        if pf_values:
            line["avg_power_factor"] = round(sum(pf_values) / len(pf_values), 3)

    return grouped


def build_industry_kpis(records, alarms):
    # Filtrer les données simulateur
    records = [r for r in records if getattr(r, "source", "") != "simulator"]

    if not records:
        return {
            "total_records": 0, "total_cost": 0, "total_co2_kg": 0,
            "highest_energy": None, "lowest_energy": None,
            "active_alarms": len([a for a in alarms if a.status == "active"]),
            "peak_demand": 0,
        }

    total_cost = total_co2 = peak = 0.0
    highest = lowest = None
    for r in records:
        cost   = calculate_cost(r.energy_name, r.value)
        co2_kg = calculate_co2(r.energy_name, r.value, r.unit)
        total_cost += cost
        total_co2  += co2_kg
        if highest is None or r.value > highest.value: highest = r
        if lowest  is None or r.value < lowest.value:  lowest  = r
        if r.value > peak: peak = r.value

    return {
        "total_records":  len(records),
        "total_cost":     round(total_cost, 2),
        "total_co2_kg":   round(total_co2,  3),
        "highest_energy": {"name": highest.energy_name, "value": highest.value, "unit": highest.unit, "line": highest.production_line} if highest else None,
        "lowest_energy":  {"name": lowest.energy_name,  "value": lowest.value,  "unit": lowest.unit,  "line": lowest.production_line}  if lowest  else None,
        "active_alarms":  len([a for a in alarms if a.status == "active"]),
        "peak_demand":    round(peak, 2),
    }


def generate_alarm_candidates(payload: dict):
    """
    Génère des alarmes basées sur les seuils configurables.
    Lit les seuils depuis thresholds.json (configuré par l'admin).
    """
    # Import ici pour éviter les imports circulaires
    try:
        from app.routes.thresholds import get_current_thresholds
        thresholds = get_current_thresholds()
    except Exception:
        thresholds = {
            "high_consumption_kw":  500.0,
            "voltage_min":          380.0,
            "voltage_max":          440.0,
            "frequency_min":        49.0,
            "frequency_max":        51.0,
            "power_factor_min":     0.85,
            "thd_max":              5.0,
            "peak_demand_warning":  400.0,
            "peak_demand_critical": 500.0,
        }

    alarms       = []
    energy_name  = payload.get("energy_name", "")
    value        = float(payload.get("value", 0))
    line         = payload.get("production_line", "Unknown")
    plant        = payload.get("plant",     "Plant 1")
    unit_name    = payload.get("unit_name", "Unit 1")
    area         = payload.get("area",      "Area 1")
    equipment    = payload.get("equipment", "Equipment 1")
    voltage      = payload.get("voltage")
    frequency    = payload.get("frequency")
    power_factor = payload.get("power_factor")
    thd          = payload.get("thd")

    base = dict(
        plant=plant, unit_name=unit_name,
        production_line=line, area=area,
        equipment=equipment, energy_name=energy_name,
    )

    # Haute consommation
    limit_kw = thresholds.get("high_consumption_kw", 500.0)
    if value > limit_kw and "electric" in energy_name.lower():
        alarms.append({**base,
            "alarm_type": "HIGH_CONSUMPTION", "severity": "high",
            "message":    f"High electricity: {value:.1f} kW > {limit_kw} kW threshold.",
            "measured_value": value, "limit_value": limit_kw,
        })

    # Tension
    if voltage is not None:
        v = float(voltage)
        v_min = thresholds.get("voltage_min", 380.0)
        v_max = thresholds.get("voltage_max", 440.0)
        if v < v_min or v > v_max:
            alarms.append({**base,
                "alarm_type": "VOLTAGE_ANOMALY", "severity": "high",
                "message":    f"Voltage {v:.1f}V outside [{v_min}–{v_max}V].",
                "measured_value": v, "limit_value": 415,
            })

    # Fréquence
    if frequency is not None:
        f = float(frequency)
        f_min = thresholds.get("frequency_min", 49.0)
        f_max = thresholds.get("frequency_max", 51.0)
        if f < f_min or f > f_max:
            alarms.append({**base,
                "alarm_type": "FREQUENCY_ANOMALY", "severity": "high",
                "message":    f"Frequency {f:.3f}Hz outside [{f_min}–{f_max}Hz].",
                "measured_value": f, "limit_value": 50,
            })

    # Facteur de puissance
    if power_factor is not None:
        pf    = float(power_factor)
        pf_min = thresholds.get("power_factor_min", 0.85)
        if pf < pf_min:
            alarms.append({**base,
                "alarm_type": "LOW_POWER_FACTOR", "severity": "medium",
                "message":    f"Power factor {pf:.3f} below {pf_min}.",
                "measured_value": pf, "limit_value": pf_min,
            })

    # THD
    if thd is not None:
        t     = float(thd)
        t_max = thresholds.get("thd_max", 5.0)
        if t > t_max:
            alarms.append({**base,
                "alarm_type": "HIGH_THD", "severity": "medium",
                "message":    f"THD {t:.2f}% exceeds {t_max}%.",
                "measured_value": t, "limit_value": t_max,
            })

    return alarms