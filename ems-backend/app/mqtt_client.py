import json
import time
import asyncio
import threading
import os
import re
from datetime import datetime

import paho.mqtt.client as mqtt

# Kafka est OPTIONNEL (alarmes Flink uniquement). Si la lib n'est pas
# installée, le backend démarre quand même : MQTT reste la source principale.
try:
    from kafka import KafkaConsumer
except ImportError:
    KafkaConsumer = None

from app.core.config import MQTT_BROKER, MQTT_PORT, MQTT_TOPIC
from app.db import SessionLocal
from app.models import Alarm, EnergyHistory, TelemetryRecord
from app.utils import calculate_cost


ALLOWED_ALARM_TYPES = {
    "UNDERVOLTAGE",
    "OVERVOLTAGE",
    "UNDERFREQUENCY",
    "OVERFREQUENCY",
    "LOW_POWER_FACTOR",
    "HIGH_THD",
    "HIGH_CONSUMPTION",
}

ALARM_TYPE_MAPPING = {
    "UNDERVOLTAGE": "UNDERVOLTAGE",
    "VOLTAGE_LOW": "UNDERVOLTAGE",
    "LOW_VOLTAGE": "UNDERVOLTAGE",

    "OVERVOLTAGE": "OVERVOLTAGE",
    "VOLTAGE_HIGH": "OVERVOLTAGE",
    "HIGH_VOLTAGE": "OVERVOLTAGE",

    "UNDERFREQUENCY": "UNDERFREQUENCY",
    "FREQ_LOW": "UNDERFREQUENCY",
    "FREQUENCY_LOW": "UNDERFREQUENCY",

    "OVERFREQUENCY": "OVERFREQUENCY",
    "FREQ_HIGH": "OVERFREQUENCY",
    "FREQUENCY_HIGH": "OVERFREQUENCY",

    "LOW_POWER_FACTOR": "LOW_POWER_FACTOR",
    "POWER_FACTOR_LOW": "LOW_POWER_FACTOR",

    "HIGH_THD": "HIGH_THD",
    "THD_HIGH": "HIGH_THD",

    "HIGH_CONSUMPTION": "HIGH_CONSUMPTION",
    "CONSUMPTION_HIGH": "HIGH_CONSUMPTION",
    "POWER_HIGH": "HIGH_CONSUMPTION",
}

POWER_QUALITY_KEYS = {
    "frequency_Hz",
    "voltage_V",
    "current_A",
    "power_factor",
    "thd_voltage_pct",
    "thd_current_pct",
}

# ── ADAPTER DATAPLATFORM ──────────────────────────────────────────────────────
# Adapter robuste pour la DataPlatform finale.
# Objectif : accepter les payloads MQTT/Kafka actuels ou futurs sans modifier
# l'application à chaque nouvelle mesure. La hiérarchie reste :
# Plant → Line → Zone/Area → Equipment.
# Les mesures inconnues sont conservées et affichées comme nouveaux KPI.

POWER_QUALITY_KEYS = {
    "frequency_Hz",
    "voltage_V",
    "current_A",
    "power_factor",
    "thd_voltage_pct",
    "thd_current_pct",
}

# Champs qui ne sont pas des mesures quand le payload est plat.
PAYLOAD_META_KEYS = {
    "device_id", "device_name", "meter_id", "id", "timestamp", "schema",
    "source", "plant", "plant_name", "site", "unit", "unit_name", "workshop",
    "line", "line_name", "production_line", "area", "zone", "area_name",
    "equipment", "equipment_name", "equipment_id", "tags", "labels",
    "measurement_name", "type", "status", "raw_topic", "mqtt_topic",
}

# Tensions et courants triphasés : moyenne pour alimenter Power Quality.
# Tensions PHASE-NEUTRE (~230 V) : moyennées en une seule "voltage_V" (la
# tension de référence de l'app, nominale 230 V). Les phase-phase en sont
# EXCLUES pour ne pas fausser la moyenne (~400 V).
THREE_PHASE_VOLTAGE_KEYS = {
    "voltage_v1", "voltage_v2", "voltage_v3",
    "voltage_l1n", "voltage_l2n", "voltage_l3n",
    "v_l1n", "v_l2n", "v_l3n",
}
# Tensions PHASE-PHASE : ignorées (ni carte KPI, ni moyenne).
PHASE_TO_PHASE_VOLTAGE_KEYS = {
    "voltage_l1l2", "voltage_l2l3", "voltage_l3l1",
    "v_l1l2", "v_l2l3", "v_l3l1",
}
THREE_PHASE_CURRENT_KEYS = {
    "current_l1", "current_l2", "current_l3",
    "current_a1", "current_a2", "current_a3",
    "i_l1", "i_l2", "i_l3",
}

CANONICAL_MEASUREMENT_KEYS = {
    "frequency_Hz": {
        "frequency_hz", "frequency", "freq_hz", "freq",
    },
    "voltage_V": {
        "voltage_v", "voltage", "volt", "u_v", "tension",
    },
    "current_A": {
        "current_a", "current", "i_a", "courant",
    },
    "power_factor": {
        "power_factor", "pf", "cos_phi", "cosphi",
    },
    "thd_voltage_pct": {
        "thd_voltage_pct", "thd_v_pct", "thd_voltage", "thd_v",
    },
    "thd_current_pct": {
        "thd_current_pct", "thd_i_pct", "thd_current", "thd_i",
    },
    "active_energy_kWh": {
        "active_energy_kwh", "energy_kwh", "kwh_total", "active_energy",
        "total_energy_kwh", "energy_consumption_kwh", "consumption_kwh",
    },
    "active_power_kW": {
        "active_power_kw", "active_power", "power_kw", "kw", "p_kw",
    },
    "reactive_power_kVAR": {
        "reactive_power_kvar", "reactive_power", "kvar", "q_kvar",
    },
    "apparent_power_kVA": {
        "apparent_power_kva", "apparent_power", "kva", "s_kva",
    },
    "co2_kg": {
        "co2_kg", "co2", "co2_emissions", "co2_emission", "carbon_kg",
        "carbon_emissions", "emissions_co2", "kgco2",
    },
    "sec_kWh_per_unit": {
        "sec", "specific_energy_consumption", "sec_kwh_per_unit",
        "sec_kwh_per_ton", "specific_energy_kwh_t",
    },
    "production_quantity": {
        "production_quantity", "production_qty", "production", "production_ton",
        "production_t", "output_ton", "output_quantity",
    },
    "water_m3": {
        "water_m3", "total_water_m3", "water_consumption", "water_consumption_m3",
        "volume_totalised_m3", "volume_totalized_m3",
    },
    # NB : steam_flow_rate / fuel_flow_rate / air_flow ne sont PAS des alias
    # de flow_rate — ils passent au catch-all pour rester des séries
    # distinctes (Steam Flow t/h, Fuel Flow L/h, Air Flow m³/h).
    "flow_rate": {
        "flow", "instant_flow", "flow_rate", "water_flow",
    },
}

DEFAULT_METER_TAGS = {
    1: "pump,critical",
    2: "motor,production",
    3: "compressor,hvac",
    4: "motor,production",
    5: "pump,water",
    6: "lighting,auxiliary",
    7: "compressor,critical",
    8: "motor,auxiliary",
}

# Tags intelligents generes cote backend quand la DataPlatform ne fournit pas
# directement un champ `tags`. La logique garde les tags envoyes par la
# DataPlatform, puis ajoute des tags issus de la hierarchie MQTT et du nom
# d'equipement : Plant / Line / Zone / Equipment / device_id.
SEMANTIC_TAG_RULES = {
    "motor": ["motor", "moteur", "mtr"],
    "pump": ["pump", "pompe"],
    "fan": ["fan", "ventilateur", "cooling_fan"],
    "hvac": ["hvac", "cooling", "chiller", "air_conditioning"],
    "conveyor": ["conveyor", "convoyeur", "belt", "belt_conveyor"],
    "crusher": ["crusher", "crushing", "broyeur", "grinder"],
    "compressor": ["compressor", "compresseur"],
    "blower": ["blower", "soufflante"],
    "valve": ["valve", "vanne"],
    "tank": ["tank", "reservoir", "storage_tank"],
    "mixer": ["mixer", "agitator", "melangeur"],
    "feeder": ["feeder", "alimentateur"],
    "screen": ["screen", "sieve", "criblage"],
    "separator": ["separator", "separateur"],
    "lighting": ["lighting", "light", "eclairage"],
    "water": ["water", "eau", "washing", "wash", "slurry"],
    "steam": ["steam", "vapeur"],
    "air": ["compressed_air", "air"],
    "fuel": ["fuel", "gas", "diesel", "gaz"],
    "electrical": ["pm", "power_meter", "meter", "electrical", "electric"],
}


def clean_name(value, default=""):
    text = str(value or "").strip()
    if not text:
        return default
    return text.replace("_", " ").replace("-", " ").strip()


# ── NORMALISATION ANTI-DOUBLONS ───────────────────────────────────────────────
# Le topic et le payload de la DataPlatform écrivent la hiérarchie sous des
# formes différentes (LINE-1 / Line-1 / Line 1, EXTRACTION / Extraction…).
# Sans normalisation unique, les filtres affichent des zones et des lignes
# en double. Ces fonctions imposent UNE forme canonique, quelle que soit la
# source. Elles sont aussi utilisées par la migration de nettoyage (main.py).

def _clean_display(value: str) -> str:
    """'EXTRACTION' → 'Extraction' ; 'STORAGE_HANDLING' → 'Storage Handling'."""
    s = str(value or "").replace("_", " ").replace("-", " ").strip()
    if s.isupper():
        s = s.title()
    return s


def _normalize_line_name(value: str) -> str:
    """'LINE-1' / 'Line 1' / 'line_1' → 'Production Line 1' (forme unique)."""
    m = re.search(r"line[\s_-]*(\d+)", str(value or ""), re.IGNORECASE)
    if m:
        return f"Production Line {m.group(1)}"
    return _clean_display(value)


def _normalize_area(value: str) -> str:
    """
    Zones : forme canonique. Les agrégats de ligne (Total_water_consumption,
    Energy_consumption) sont regroupés sous la zone unique 'Line Total'.
    """
    low = str(value or "").strip().lower().replace("_", " ").replace("-", " ")
    if low.startswith(("energy consumption", "total water")):
        return "Line Total"
    return _clean_display(value)


def normalize_tag(value) -> str:
    """Retourne un tag stable, minuscule, sans espaces ni caracteres inutiles."""
    import re

    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = text.replace("#", "")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text


def add_tag(tags: list[str], value) -> None:
    tag = normalize_tag(value)
    if tag and tag not in tags:
        tags.append(tag)


def extract_provided_tags(raw: dict) -> list[str]:
    value = raw.get("tags")
    if value is None:
        value = raw.get("labels")

    if isinstance(value, (list, tuple, set)):
        return [normalize_tag(t) for t in value if normalize_tag(t)]

    if isinstance(value, str) and value.strip():
        return [normalize_tag(t) for t in value.split(",") if normalize_tag(t)]

    return []


def infer_semantic_tags(text: str) -> list[str]:
    """Detecte les types d'equipements : motor, pump, fan, conveyor, etc."""
    normalized_text = normalize_tag(text)
    if not normalized_text:
        return []

    found = []
    padded = f"_{normalized_text}_"
    for tag, keywords in SEMANTIC_TAG_RULES.items():
        for keyword in keywords:
            kw = normalize_tag(keyword)
            if not kw:
                continue
            # Match exact token inside names like water_pump_a or main_motor_01.
            if f"_{kw}_" in padded or normalized_text == kw:
                found.append(tag)
                break
    return found


def extract_tags(raw: dict, meter_id: int, topic_topology: dict | None = None, equipment: str | None = None) -> str | None:
    tags: list[str] = []

    for tag in extract_provided_tags(raw):
        add_tag(tags, tag)

    topic_topology = topic_topology or {}

    hierarchy_values = [
        raw.get("plant") or raw.get("plant_name") or raw.get("site") or topic_topology.get("plant"),
        raw.get("production_line") or raw.get("line") or raw.get("line_name") or topic_topology.get("production_line"),
        raw.get("area") or raw.get("zone") or raw.get("area_name") or topic_topology.get("area"),
        equipment,
        raw.get("equipment") or raw.get("equipment_name") or raw.get("device_name"),
        raw.get("device_id") or raw.get("meter_id"),
        topic_topology.get("measurement_name"),
    ]
    for value in hierarchy_values:
        add_tag(tags, value)

    semantic_source = " ".join(str(v or "") for v in hierarchy_values)
    for tag in infer_semantic_tags(semantic_source):
        add_tag(tags, tag)

    if not tags and meter_id in DEFAULT_METER_TAGS:
        for tag in DEFAULT_METER_TAGS[meter_id].split(","):
            add_tag(tags, tag)

    return ",".join(tags) if tags else None


def safe_float(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def normalize_measurements(measurements: dict) -> dict:
    if not isinstance(measurements, dict):
        return {}

    normalized = {}
    phase_voltages = []
    phase_currents = []

    for raw_key, value in measurements.items():
        key_lower = str(raw_key).strip().lower()

        # Tensions phase-neutre → moyennées en voltage_V (PAS de carte séparée)
        if key_lower in THREE_PHASE_VOLTAGE_KEYS:
            v = safe_float(value)
            if v is not None:
                phase_voltages.append(v)
            continue

        # Tensions phase-phase → totalement ignorées (fausseraient la moyenne)
        if key_lower in PHASE_TO_PHASE_VOLTAGE_KEYS:
            continue

        # Courants par phase → moyennés en current_A (PAS de carte séparée)
        if key_lower in THREE_PHASE_CURRENT_KEYS:
            i = safe_float(value)
            if i is not None:
                phase_currents.append(i)
            continue

        matched = False
        for canonical, aliases in CANONICAL_MEASUREMENT_KEYS.items():
            if key_lower == canonical.lower() or key_lower in aliases:
                normalized[canonical] = value
                matched = True
                break

        if not matched:
            normalized[raw_key] = value

    if phase_voltages and "voltage_V" not in normalized:
        normalized["voltage_V"] = round(sum(phase_voltages) / len(phase_voltages), 3)

    if phase_currents and "current_A" not in normalized:
        normalized["current_A"] = round(sum(phase_currents) / len(phase_currents), 3)

    return normalized


def extract_measurements(raw: dict) -> dict:
    """Accepte payload imbriqué, payload plat, ou steam/fuel nested."""
    measurements = raw.get("measurements")

    if isinstance(measurements, dict) and measurements:
        return measurements

    # Steam/fuel nested payload : {steam:{flow_rate...}, fuel:{...}}
    extracted = {}
    for prefix in ["steam", "fuel"]:
        block = raw.get(prefix)
        if isinstance(block, dict):
            for key, value in block.items():
                if isinstance(value, (int, float)):
                    extracted[f"{prefix}_{key}"] = value

    for key, value in raw.items():
        if str(key).lower() not in PAYLOAD_META_KEYS and isinstance(value, (int, float)):
            extracted[key] = value

    return extracted


_kafka_consumers_started = False
MAIN_LOOP = None


def set_main_loop(loop) -> None:
    global MAIN_LOOP
    MAIN_LOOP = loop


def parse_datetime(value):
    if value is None or value == "":
        return datetime.utcnow()

    if isinstance(value, (int, float)) or str(value).strip().isdigit():
        try:
            ts = float(value)
            if ts > 1e12:
                ts /= 1000.0
            return datetime.utcfromtimestamp(ts)
        except Exception:
            return datetime.utcnow()

    try:
        cleaned = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is not None:
            return dt.replace(tzinfo=None)
        return dt
    except Exception:
        return datetime.utcnow()


def get_meter_id(topic: str = "", raw: dict | None = None) -> int:
    raw = raw or {}
    for candidate in [raw.get("meter_id"), raw.get("device_id"), raw.get("id")]:
        if candidate is None:
            continue
        digits = "".join(ch for ch in str(candidate) if ch.isdigit())
        if digits:
            return int(digits)

    # dernier segment avec chiffres: PM1, Motor-03, etc.
    for segment in reversed(str(topic).split("/")):
        digits = "".join(ch for ch in segment if ch.isdigit())
        if digits:
            return int(digits)
    return 1


METERS_PER_ZONE = 2
ZONES_PER_LINE = 2
LINES_PER_PLANT = 2
_ZONE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def get_plant(meter_id: int) -> str:
    meters_per_plant = METERS_PER_ZONE * ZONES_PER_LINE * LINES_PER_PLANT
    return f"Plant {((meter_id - 1) // meters_per_plant) + 1}"


def get_line(meter_id: int) -> str:
    meters_per_line = METERS_PER_ZONE * ZONES_PER_LINE
    return f"Production Line {((meter_id - 1) // meters_per_line) + 1}"


def get_area(meter_id: int) -> str:
    zone_index = (meter_id - 1) // METERS_PER_ZONE
    return f"Zone {_ZONE_LETTERS[zone_index % len(_ZONE_LETTERS)]}"


def get_unit_name(meter_id: int) -> str:
    return f"Unit-{((meter_id - 1) // METERS_PER_ZONE) + 1}"


def get_ws_manager():
    try:
        from app.routes.websocket import manager
        return manager
    except Exception:
        return None


def broadcast_ws(payload: dict) -> None:
    ws = get_ws_manager()
    if not ws or not getattr(ws, "active_connections", None):
        return
    if MAIN_LOOP is None or MAIN_LOOP.is_closed():
        return
    try:
        asyncio.run_coroutine_threadsafe(ws.broadcast(payload), MAIN_LOOP)
    except Exception as exc:
        print(f"⚠️ WS broadcast error: {exc}")


def normalize_energy_name(key: str) -> str:
    replacements = {
        "active_energy_kWh": "Electricity-kWh",
        "energy_consumption_kWh": "Electricity-kWh",
        "active_power_kW": "Electricity",
        "co2_kg": "CO2-Emissions",
        "sec_kWh_per_unit": "SEC",
        "water_m3": "Water",
        "flow_rate": "Flow Rate",
        "reactive_power_kVAR": "Reactive Power",
        "apparent_power_kVA": "Apparent Power",
        "steam_flow_rate": "Steam Flow",
        "steam_totalizer": "Steam",
        "fuel_flow_rate": "Fuel Flow",
        "fuel_totalizer": "Fuel",
        "production_quantity": "Production Quantity",
    }
    if key in replacements:
        return replacements[key]

    name = str(key).strip()
    name = re.sub(r"(_kwh|_kw|_kvar|_kva|_m3|_kg|_l|_pct|_hz|_a|_v)$", "", name, flags=re.I)
    name = name.replace("_", " ").replace("-", " ").strip().title()
    return name or key


def infer_unit(key: str) -> str:
    lower = str(key).lower()
    if "sec" in lower:
        return "kWh/unit"
    if "kwh" in lower:
        return "kWh"
    # kVAR/kVA AVANT le test kW : "reactive_power_kvar" contient la
    # sous-chaîne "active_power" et retournait "kW" par erreur.
    if "kvar" in lower or "reactive" in lower:
        return "kVAR"
    if "kva" in lower or "apparent" in lower:
        return "kVA"
    if lower.endswith("_kw") or "active_power" in lower:
        return "kW"
    # Vapeur / fuel : totalisateurs facturables et débits distincts
    if "steam" in lower and ("total" in lower or lower.endswith("_t")):
        return "tonne"
    if "steam" in lower and "flow" in lower:
        return "t/h"
    if "fuel" in lower and ("total" in lower or lower.endswith("_l")):
        return "L"
    if "fuel" in lower and "flow" in lower:
        return "L/h"
    if "pressure" in lower:
        return "bar"
    if "temperature" in lower or lower.endswith("_temp"):
        return "°C"
    if "breaker" in lower or "trip" in lower or lower == "status":
        return "on/off"
    if lower.endswith("_m3") or "water" in lower and "flow" not in lower:
        return "m³"
    if "flow" in lower:
        return "m³/h"
    if lower.endswith("_kg") or "co2" in lower or "carbon" in lower:
        return "kgCO2" if ("co2" in lower or "carbon" in lower) else "kg"
    if lower.endswith("_l"):
        return "L"
    if "pct" in lower or "percent" in lower or "thd" in lower:
        return "%"
    if "frequency" in lower:
        return "Hz"
    if "voltage" in lower:
        return "V"
    if "current" in lower:
        return "A"
    if "production" in lower or "output" in lower:
        return "unit"
    return ""


def extract_topic_topology(topic: str) -> dict:
    seg = [s for s in str(topic or "").split("/") if s]
    # DataPlatform finale : Plant / Line / Area / Equipment / Measurement
    return {
        "plant": clean_name(seg[0]) if len(seg) > 0 else "",
        "production_line": clean_name(seg[1]) if len(seg) > 1 else "",
        "area": clean_name(seg[2]) if len(seg) > 2 else "",
        "equipment": clean_name(seg[3]) if len(seg) > 3 else "",
        "measurement_name": clean_name(seg[4]) if len(seg) > 4 else "",
    }


def extract_topology(topic: str, raw: dict) -> dict:
    meter_id = get_meter_id(topic, raw)
    topic_topology = extract_topic_topology(topic)
    measurement_name = topic_topology.get("measurement_name") or raw.get("measurement_name")

    # Agrégats de ligne (Total_water_consumption…) : le topic n'a pas de
    # segment équipement — on utilise le nom de l'agrégat comme équipement.
    aggregate_equipment = None
    if _normalize_area(topic_topology.get("area") or "") == "Line Total":
        aggregate_equipment = _clean_display(topic_topology.get("area"))

    equipment = (
        raw.get("equipment")
        or raw.get("equipment_name")
        or raw.get("device_name")
        or topic_topology.get("equipment")
        or aggregate_equipment
        or measurement_name
        or f"Power Meter {meter_id}"
    )

    # Normalisation ANTI-DOUBLONS : quelle que soit la source (topic ou
    # payload, MAJUSCULES ou pas), la hiérarchie est stockée sous une forme
    # canonique unique → plus de zones/lignes en double dans les filtres.
    return {
        "meter_id": meter_id,
        "tags": extract_tags(raw, meter_id, topic_topology=topic_topology, equipment=equipment),
        "plant": _clean_display(
            raw.get("plant") or raw.get("plant_name") or raw.get("site")
            or topic_topology.get("plant") or get_plant(meter_id)
        ),
        "unit_name": raw.get("unit_name") or raw.get("unit") or raw.get("workshop") or get_unit_name(meter_id),
        "production_line": _normalize_line_name(
            raw.get("production_line") or raw.get("line") or raw.get("line_name")
            or topic_topology.get("production_line") or get_line(meter_id)
        ),
        "area": _normalize_area(
            raw.get("area") or raw.get("zone") or raw.get("area_name")
            or topic_topology.get("area") or get_area(meter_id)
        ),
        "equipment": _clean_display(equipment),
    }


# ── ALARMES LOCALES DE SEUILS ─────────────────────────────────────────────────
# La nouvelle DataPlatform ne déploie pas de job Flink d'alertes : le backend
# applique lui-même les seuils configurés dans la page Alarm Thresholds
# (thresholds.json) sur chaque mesure reçue — avec déduplication par équipement.

_THRESHOLDS_CACHE = {"data": None, "ts": 0.0}


def get_cached_thresholds() -> dict:
    """Relit thresholds.json au plus toutes les 10 s (pas à chaque message)."""
    now = time.time()
    if _THRESHOLDS_CACHE["data"] is None or now - _THRESHOLDS_CACHE["ts"] > 10:
        try:
            from app.routes.thresholds import load_thresholds
            _THRESHOLDS_CACHE["data"] = load_thresholds()
        except Exception:
            _THRESHOLDS_CACHE["data"] = {}
        _THRESHOLDS_CACHE["ts"] = now
    return _THRESHOLDS_CACHE["data"] or {}


def raise_local_alarm(meta: dict, alarm_type: str, severity: str,
                      message: str, measured, limit) -> None:
    """Crée (ou rafraîchit) une alarme locale, dédupliquée par équipement."""
    db = SessionLocal()
    try:
        existing = find_active_alarm(
            db, alarm_type, meta["production_line"], meta["equipment"]
        )
        timestamp = meta.get("timestamp") or datetime.utcnow()

        if existing:
            existing.measured_value = measured
            existing.created_at = timestamp
            db.commit()
            return

        db.add(
            Alarm(
                plant=meta["plant"],
                unit_name=meta["unit_name"],
                production_line=meta["production_line"],
                area=meta["area"],
                equipment=meta["equipment"],
                energy_name="Power Quality",
                alarm_type=alarm_type,
                severity=severity,
                message=message,
                measured_value=measured,
                limit_value=limit,
                status="active",
                created_at=timestamp,
            )
        )
        db.commit()

        print(f"🚨 Threshold alarm: [{severity.upper()}] {alarm_type} | {meta['equipment']} | {measured}")

        broadcast_ws(
            {
                "type": "flink_alarm",
                "action": "created",
                "alarm_type": alarm_type,
                "severity": severity,
                "device": meta["equipment"],
                "production_line": meta["production_line"],
                "value": measured,
                "message": message,
            }
        )
    except Exception as error:
        db.rollback()
        print(f"❌ raise_local_alarm error: {error}")
    finally:
        db.close()


def check_threshold_alarms(meta: dict, active_kw) -> None:
    """
    Applique les seuils configurés (Alarm Thresholds) à la mesure reçue.
    Un équipement hors tension (voltage < 50 V = arrêté) n'est PAS une
    anomalie électrique : ses seuils ne sont vérifiés que s'il est alimenté.
    """
    th = get_cached_thresholds()
    if not th:
        return

    voltage = meta.get("voltage")
    frequency = meta.get("frequency")
    power_factor = meta.get("power_factor")
    thd = meta.get("thd")
    equipment = meta.get("equipment", "?")

    energized = voltage is not None and voltage >= 50

    if energized:
        if voltage < th.get("voltage_min", 0):
            raise_local_alarm(meta, "UNDERVOLTAGE", "high",
                              f"Voltage {voltage:.1f} V below minimum on {equipment}",
                              voltage, th.get("voltage_min"))
        elif voltage > th.get("voltage_max", 10**9):
            raise_local_alarm(meta, "OVERVOLTAGE", "high",
                              f"Voltage {voltage:.1f} V above maximum on {equipment}",
                              voltage, th.get("voltage_max"))

        if frequency is not None and frequency > 10:
            if frequency < th.get("frequency_min", 0):
                raise_local_alarm(meta, "UNDERFREQUENCY", "medium",
                                  f"Frequency {frequency:.2f} Hz below minimum on {equipment}",
                                  frequency, th.get("frequency_min"))
            elif frequency > th.get("frequency_max", 10**9):
                raise_local_alarm(meta, "OVERFREQUENCY", "medium",
                                  f"Frequency {frequency:.2f} Hz above maximum on {equipment}",
                                  frequency, th.get("frequency_max"))

        if power_factor is not None and 0 < power_factor < th.get("power_factor_min", 0):
            raise_local_alarm(meta, "LOW_POWER_FACTOR", "medium",
                              f"Power factor {power_factor:.2f} below minimum on {equipment}",
                              power_factor, th.get("power_factor_min"))

        if thd is not None and thd > th.get("thd_max", 10**9):
            raise_local_alarm(meta, "HIGH_THD", "medium",
                              f"THD {thd:.1f}% above maximum on {equipment}",
                              thd, th.get("thd_max"))

    if (
        active_kw is not None
        and th.get("high_consumption_kw")
        and active_kw > th["high_consumption_kw"]
    ):
        raise_local_alarm(meta, "HIGH_CONSUMPTION", "high",
                          f"Power {active_kw:.1f} kW above threshold on {equipment}",
                          active_kw, th.get("high_consumption_kw"))


# ── PHOSPHATE : tonnes produites (cumul) ─────────────────────────────────────
# Les balances (Weigh Belt Scales) mesurent un DÉBIT en t/h. Les tonnes
# produites sont obtenues en intégrant ce débit dans le temps :
#   tonnes += débit (t/h) × durée écoulée (h)
# 100 % dérivé des mesures réelles de la DataPlatform (comme CO₂ = kWh × facteur).
# Le cumul reprend sa dernière valeur en base après un redémarrage.
_PHOSPHATE_TOTALS = {}


def update_phosphate_total(meta: dict, rate_tph: float):
    key = (meta["production_line"], meta["equipment"])
    now = meta.get("timestamp") or datetime.utcnow()
    state = _PHOSPHATE_TOTALS.get(key)

    if state is None:
        total = 0.0
        db = SessionLocal()
        try:
            last = (
                db.query(TelemetryRecord.value)
                .filter(
                    TelemetryRecord.energy_name == "Phosphate Production",
                    TelemetryRecord.production_line == key[0],
                    TelemetryRecord.equipment == key[1],
                )
                .order_by(TelemetryRecord.timestamp.desc())
                .first()
            )
            if last:
                total = float(last[0])
        except Exception:
            pass
        finally:
            db.close()
        _PHOSPHATE_TOTALS[key] = {"total": total, "ts": now}
        return round(total, 3)

    dt_hours = (now - state["ts"]).total_seconds() / 3600.0
    # Trous de données / horloges incohérentes : on n'extrapole pas au-delà
    # de 30 min entre deux mesures.
    if 0 < dt_hours <= 0.5:
        state["total"] += max(0.0, float(rate_tph)) * dt_hours
    state["ts"] = now
    return round(state["total"], 3)


def parse_dataplatform_payload(topic: str, raw: dict) -> list[dict]:
    topology = extract_topology(topic, raw)
    measurements = normalize_measurements(extract_measurements(raw))
    if not measurements:
        return []

    timestamp = parse_datetime(raw.get("timestamp"))

    voltage = safe_float(measurements.get("voltage_V"))
    current = safe_float(measurements.get("current_A"))
    frequency = safe_float(measurements.get("frequency_Hz"))
    power_factor = safe_float(measurements.get("power_factor"))
    thd_voltage = safe_float(measurements.get("thd_voltage_pct"))
    active_kwh = safe_float(measurements.get("active_energy_kWh"))
    active_kw_direct = safe_float(measurements.get("active_power_kW"))
    co2_direct = safe_float(measurements.get("co2_kg"))
    sec_direct = safe_float(measurements.get("sec_kWh_per_unit"))
    production_qty = safe_float(measurements.get("production_quantity"))

    meta = {
        "plant": topology["plant"],
        "unit_name": topology["unit_name"],
        "production_line": topology["production_line"],
        "area": topology["area"],
        "equipment": topology["equipment"],
        "tags": topology["tags"],
        "source": "dataplatform",
        "timestamp": timestamp,
        "voltage": voltage,
        "frequency": frequency,
        "power_factor": power_factor,
        "thd": thd_voltage,
    }

    records = []

    if active_kw_direct is not None:
        records.append({**meta, "energy_name": "Electricity", "value": active_kw_direct, "unit": "kW"})
    elif voltage is not None and current is not None and power_factor is not None:
        factor = 1.732 if voltage > 300 else 1.0
        kw = round(factor * voltage * current * power_factor / 1000, 3)
        records.append({**meta, "energy_name": "Electricity", "value": kw, "unit": "kW"})

    if active_kwh is not None:
        records.append({**meta, "energy_name": "Electricity-kWh", "value": active_kwh, "unit": "kWh"})

    if co2_direct is not None:
        records.append({**meta, "energy_name": "CO2-Emissions", "value": co2_direct, "unit": "kgCO2"})

    if sec_direct is not None:
        records.append({**meta, "energy_name": "SEC", "value": sec_direct, "unit": "kWh/unit"})
    elif active_kwh is not None and production_qty and production_qty > 0:
        sec = round(active_kwh / production_qty, 4)
        records.append({**meta, "energy_name": "SEC", "value": sec, "unit": "kWh/unit"})

    used_keys = POWER_QUALITY_KEYS | {
        "active_energy_kWh", "active_power_kW", "co2_kg",
        "sec_kWh_per_unit", "production_quantity",
    }

    for key, value in measurements.items():
        if key in used_keys:
            continue
        numeric = safe_float(value)
        if numeric is None:
            continue
        # alarm_trip n'est pas une mesure : c'est un événement de protection.
        # → alarme EQUIPMENT_TRIP (dédupliquée), pas de série de données.
        if str(key).lower() in {"alarm_trip", "trip_alarm", "protection_trip"}:
            if numeric >= 1:
                raise_local_alarm(
                    meta, "EQUIPMENT_TRIP", "high",
                    f"Protection trip detected on {meta['equipment']} (DataPlatform)",
                    numeric, None,
                )
            continue
        # Weigh Belt Scale = débit de PRODUCTION phosphate (t/h), pas un débit
        # d'eau : série "Production Rate" (sert au SEC) + cumul en TONNES
        # "Phosphate Production" (KPI principal, intégration du débit mesuré).
        if key == "flow_rate":
            equipment_lower = str(meta["equipment"]).lower()
            if "weigh" in equipment_lower or "scale" in equipment_lower:
                records.append({**meta, "energy_name": "Production Rate", "value": numeric, "unit": "t/h"})
                tons = update_phosphate_total(meta, numeric)
                if tons is not None and tons > 0:
                    records.append({**meta, "energy_name": "Phosphate Production", "value": tons, "unit": "tonne"})
                continue
        records.append({
            **meta,
            "energy_name": normalize_energy_name(key),
            "value": numeric,
            "unit": infer_unit(key),
        })

    # Seuils configurés (page Alarm Thresholds) → alarmes locales
    # (UNDER/OVERVOLTAGE, UNDER/OVERFREQUENCY, LOW_POWER_FACTOR, HIGH_THD,
    #  HIGH_CONSUMPTION), dédupliquées par équipement.
    active_kw = active_kw_direct
    if active_kw is None:
        for r in records:
            if r["unit"] == "kW":
                active_kw = r["value"]
                break
    check_threshold_alarms(meta, active_kw)

    return records


def save_telemetry_record(payload: dict) -> None:
    db = SessionLocal()

    try:
        record = TelemetryRecord(
            plant=payload["plant"],
            unit_name=payload["unit_name"],
            production_line=payload["production_line"],
            area=payload["area"],
            equipment=payload["equipment"],
            energy_name=payload["energy_name"],
            value=float(payload["value"]),
            unit=payload["unit"],
            tags=payload.get("tags"),
            source=payload.get("source", "dataplatform"),
            voltage=payload.get("voltage"),
            frequency=payload.get("frequency"),
            power_factor=payload.get("power_factor"),
            thd=payload.get("thd"),
            timestamp=payload.get("timestamp") or datetime.utcnow(),
        )

        db.add(record)
        db.flush()

        cost = calculate_cost(record.energy_name, record.value)

        db.add(
            EnergyHistory(
                plant=record.plant,
                unit_name=record.unit_name,
                production_line=record.production_line,
                area=record.area,
                equipment=record.equipment,
                energy_name=record.energy_name,
                value=record.value,
                unit=record.unit,
                cost=cost,
                timestamp=record.timestamp,
            )
        )

        db.commit()

        broadcast_ws(
            {
                "type": "telemetry",
                "source": record.source,
                "production_line": record.production_line,
                "plant": record.plant,
                "area": record.area,
                "equipment": record.equipment,
                "tags": record.tags,
                "energy_name": record.energy_name,
                "value": record.value,
                "unit": record.unit,
                "voltage": record.voltage,
                "frequency": record.frequency,
                "power_factor": record.power_factor,
                "thd": record.thd,
                "timestamp": record.timestamp.isoformat(),
                "cost": cost,
            }
        )

        print(
            f"✅ {record.source} | {record.production_line} | "
            f"{record.energy_name} | {record.value:.3f} {record.unit}"
        )

    except Exception as error:
        db.rollback()
        print(f"❌ save_telemetry_record error: {error}")

    finally:
        db.close()


def extract_limit_value(raw_limit, alarm_type: str):
    if raw_limit is None:
        return None

    direct = safe_float(raw_limit)

    if direct is not None:
        return direct

    numbers = re.findall(r"[-+]?\d*\.?\d+", str(raw_limit))

    if not numbers:
        return None

    values = [float(number) for number in numbers]

    if alarm_type in [
        "OVERVOLTAGE",
        "OVERFREQUENCY",
        "HIGH_THD",
        "HIGH_CONSUMPTION",
    ]:
        return max(values)

    return min(values)


def normalize_alarm_type(alarm_type: str) -> str | None:
    if not alarm_type:
        return None

    normalized = str(alarm_type).strip().upper()

    return ALARM_TYPE_MAPPING.get(normalized)


def severity_from_priority(priority: str) -> str:
    priority = str(priority or "").upper()

    if priority == "HIGH":
        return "high"

    if priority == "LOW":
        return "low"

    return "medium"


def parse_meter_id_from_alarm(alarm: dict) -> int:
    return get_meter_id(
        "",
        {
            "device_id": alarm.get("device_id")
            or alarm.get("device")
            or alarm.get("meter_id")
        },
    )


def alarm_topology(alarm: dict) -> dict:
    meter_id = parse_meter_id_from_alarm(alarm)

    return {
        "meter_id": meter_id,

        "plant": alarm.get("plant")
        or alarm.get("plant_name")
        or get_plant(meter_id),

        "unit_name": alarm.get("unit_name")
        or alarm.get("unit")
        or get_unit_name(meter_id),

        "production_line": alarm.get("production_line")
        or alarm.get("line")
        or alarm.get("line_name")
        or get_line(meter_id),

        "area": alarm.get("area")
        or alarm.get("zone")
        or alarm.get("area_name")
        or get_area(meter_id),

        "equipment": alarm.get("equipment")
        or alarm.get("equipment_name")
        or alarm.get("device_name")
        or alarm.get("device")
        or f"Power Meter {meter_id}",
    }


def find_active_alarm(db, alarm_type: str, production_line: str, equipment: str):
    return (
        db.query(Alarm)
        .filter(
            Alarm.alarm_type == alarm_type,
            Alarm.production_line == production_line,
            Alarm.equipment == equipment,
            Alarm.status == "active",
        )
        .first()
    )


def save_flink_alarm(alarm: dict) -> None:
    db = SessionLocal()

    try:
        raw_alarm_type = alarm.get("alarm_type") or alarm.get("type")
        alarm_type = normalize_alarm_type(raw_alarm_type)

        if not alarm_type or alarm_type not in ALLOWED_ALARM_TYPES:
            print(f"⚠️ Flink alarm ignored: {raw_alarm_type}")
            return

        topology = alarm_topology(alarm)

        priority = alarm.get("priority") or alarm.get("severity") or "MEDIUM"
        severity = severity_from_priority(priority)

        measured_value = safe_float(
            alarm.get("value")
            or alarm.get("measured_value")
            or alarm.get("current_value"),
            0.0,
        )

        limit_value = extract_limit_value(
            alarm.get("limit_value")
            or alarm.get("threshold")
            or alarm.get("limit"),
            alarm_type,
        )

        message = (
            alarm.get("message")
            or f"{alarm_type} detected by Flink for {topology['equipment']}"
        )

        event_timestamp = parse_datetime(alarm.get("timestamp"))

        existing = find_active_alarm(
            db,
            alarm_type,
            topology["production_line"],
            topology["equipment"],
        )

        if existing:
            existing.severity = severity
            existing.message = message
            existing.measured_value = measured_value
            existing.limit_value = limit_value
            existing.created_at = event_timestamp

            db.commit()

            print(
                f"🔄 Flink alarm refreshed: [{severity.upper()}] "
                f"{alarm_type} | {topology['equipment']} | {measured_value}"
            )

            broadcast_ws(
                {
                    "type": "flink_alarm",
                    "action": "refreshed",
                    "alarm_type": alarm_type,
                    "severity": severity,
                    "device": topology["equipment"],
                    "production_line": topology["production_line"],
                    "value": measured_value,
                    "message": message,
                }
            )

            return

        db.add(
            Alarm(
                plant=topology["plant"],
                unit_name=topology["unit_name"],
                production_line=topology["production_line"],
                area=topology["area"],
                equipment=topology["equipment"],
                energy_name="Power Quality",
                alarm_type=alarm_type,
                severity=severity,
                message=message,
                measured_value=measured_value,
                limit_value=limit_value,
                status="active",
                created_at=event_timestamp,
            )
        )

        db.commit()

        print(
            f"🚨 Flink alarm saved: [{severity.upper()}] "
            f"{alarm_type} | {topology['equipment']} | {measured_value}"
        )

        broadcast_ws(
            {
                "type": "flink_alarm",
                "action": "created",
                "alarm_type": alarm_type,
                "severity": severity,
                "device": topology["equipment"],
                "production_line": topology["production_line"],
                "value": measured_value,
                "message": message,
            }
        )

    except Exception as error:
        db.rollback()
        print(f"❌ Flink alarm error: {error}")

    finally:
        db.close()


def consume_kafka_alerts():
    if KafkaConsumer is None:
        print("⚠️ kafka-python not installed — Flink alerts consumer disabled (MQTT still active)")
        return
    kafka_broker = os.getenv("KAFKA_BROKER", "kafka:9092")
    alert_topic = os.getenv("KAFKA_ALERT_TOPIC", "ems.alerts")

    while True:
        try:
            consumer = KafkaConsumer(
                alert_topic,
                bootstrap_servers=[kafka_broker],
                group_id="ems-backend-alerts-adapter-v3",
                auto_offset_reset="earliest",
                value_deserializer=lambda message: json.loads(
                    message.decode("utf-8")
                ),
            )

            print(f"✅ Kafka consumer connected → {alert_topic} on {kafka_broker}")

            for message in consumer:
                save_flink_alarm(message.value)

        except Exception as error:
            print(f"⚠️ Kafka alerts consumer error: {error}")
            time.sleep(5)


def start_kafka_consumers():
    global _kafka_consumers_started

    if _kafka_consumers_started:
        return

    _kafka_consumers_started = True

    threading.Thread(target=consume_kafka_alerts, daemon=True).start()


def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"✅ MQTT connected → {MQTT_BROKER}:{MQTT_PORT}")

    # Topic configurable via .env (MQTT_TOPIC). Si la DataPlatform finale
    # change de topic, il suffit de modifier le .env — AUCUN code à toucher.
    topic = MQTT_TOPIC or "ems/meters/#"
    client.subscribe(topic, qos=1)
    print(f"✅ Subscribed: {topic}")

    # Sécurité : on garde aussi le topic historique si différent
    if topic != "ems/meters/#":
        client.subscribe("ems/meters/#", qos=1)
        print("✅ Subscribed (fallback): ems/meters/#")


def on_message(client, userdata, msg):
    try:
        raw = json.loads(msg.payload.decode("utf-8"))

        if not isinstance(raw, dict):
            return

        # Accepte payload imbriqué ("measurements") OU plat (mesures racine)
        if not extract_measurements(raw):
            return

        print(f"📩 DataPlatform MQTT {msg.topic} → {raw.get('device_id')}")

        records = parse_dataplatform_payload(msg.topic, raw)

        for record in records:
            save_telemetry_record(record)

    except json.JSONDecodeError:
        print(f"❌ Invalid JSON: {msg.topic}")

    except Exception as error:
        print(f"❌ on_message error: {error}")


def create_mqtt_client():
    try:
        return mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    except Exception:
        return mqtt.Client()


def start_mqtt():
    start_kafka_consumers()

    client = create_mqtt_client()

    client.on_connect = on_connect
    client.on_message = on_message

    retries = 0

    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            break
        except Exception as error:
            retries += 1
            wait = min(30, retries * 3)
            print(f"⏳ MQTT retry {retries} in {wait}s ({error})")
            time.sleep(wait)

    client.loop_start()

    return client