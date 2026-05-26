import json
import time
import asyncio
import threading
import os
import re
from datetime import datetime

import paho.mqtt.client as mqtt
from kafka import KafkaConsumer

from app.core.config import MQTT_BROKER, MQTT_PORT
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

_kafka_consumers_started = False


def safe_float(value, default=None):
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def parse_datetime(value):
    if not value:
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

    for candidate in [
        raw.get("meter_id"),
        raw.get("device_id"),
        raw.get("id"),
    ]:
        if candidate is None:
            continue

        digits = "".join(ch for ch in str(candidate) if ch.isdigit())

        if digits:
            return int(digits)

    try:
        return int(str(topic).split("/")[-1])
    except Exception:
        return 1


def get_line(meter_id: int) -> str:
    return f"Production Line {((meter_id - 1) // 2) + 1}"


def get_area(meter_id: int) -> str:
    areas = [
        "Zone A",
        "Zone B",
        "Zone C",
        "Zone D",
        "Zone E",
        "Zone F",
        "Zone G",
        "Zone H",
    ]

    return areas[((meter_id - 1) // 2) % len(areas)]


def get_unit_name(meter_id: int) -> str:
    return f"Unit-{((meter_id - 1) // 2) + 1}"


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

    try:
        loop = asyncio.get_event_loop()

        if loop.is_running():
            asyncio.create_task(ws.broadcast(payload))
    except Exception:
        pass


def normalize_energy_name(key: str) -> str:
    replacements = {
        "active_energy_kWh": "Electricity-kWh",
        "electricity_kwh": "Electricity-kWh",
        "electricity_kw": "Electricity",
        "active_power_kW": "Electricity",
        "active_power_kw": "Electricity",
        "power_kw": "Electricity",

        "co2_kg": "CO2-Emissions",
        "co2_emissions": "CO2-Emissions",
        "carbon_kg": "CO2-Emissions",

        "water_m3": "Water",
        "eau_m3": "Water",
        "steam_kg": "Steam",
        "steam_ton": "Steam",
        "gas_m3": "Natural Gas",
        "natural_gas_m3": "Natural Gas",
        "diesel_l": "Diesel",
        "fuel_l": "Fuel",
        "solar_kWh": "Solar",
        "solar_kwh": "Solar",
        "compressed_air_m3": "Compressed Air",
    }

    if key in replacements:
        return replacements[key]

    name = str(key).strip()
    name = re.sub(r"(_kwh|_kWh|_kw|_kW|_m3|_kg|_l|_L|_pct)$", "", name)
    name = name.replace("_", " ").replace("-", " ").strip().title()

    return name or key


def infer_unit(key: str) -> str:
    lower = str(key).lower()

    if "kwh" in lower:
        return "kWh"

    if lower.endswith("_kw"):
        return "kW"

    if lower.endswith("_m3"):
        return "m³"

    if lower.endswith("_kg"):
        return "kg"

    if lower.endswith("_l"):
        return "L"

    if "pct" in lower or "percent" in lower:
        return "%"

    if "co2" in lower or "carbon" in lower:
        return "kgCO2"

    return ""


def extract_topology(topic: str, raw: dict) -> dict:
    meter_id = get_meter_id(topic, raw)

    return {
        "meter_id": meter_id,

        "plant": raw.get("plant")
        or raw.get("plant_name")
        or raw.get("site")
        or "Plant 1",

        "unit_name": raw.get("unit_name")
        or raw.get("unit")
        or raw.get("workshop")
        or get_unit_name(meter_id),

        "production_line": raw.get("production_line")
        or raw.get("line")
        or raw.get("line_name")
        or get_line(meter_id),

        "area": raw.get("area")
        or raw.get("zone")
        or raw.get("area_name")
        or get_area(meter_id),

        "equipment": raw.get("equipment")
        or raw.get("equipment_name")
        or raw.get("device_name")
        or f"Power Meter {meter_id}",
    }


def parse_dataplatform_payload(topic: str, raw: dict) -> list[dict]:
    topology = extract_topology(topic, raw)
    measurements = raw.get("measurements", {})

    if not isinstance(measurements, dict):
        return []

    timestamp = parse_datetime(raw.get("timestamp"))

    voltage = safe_float(measurements.get("voltage_V"))
    current = safe_float(measurements.get("current_A"))
    frequency = safe_float(measurements.get("frequency_Hz"))
    power_factor = safe_float(measurements.get("power_factor"))
    thd_voltage = safe_float(measurements.get("thd_voltage_pct"))
    active_kwh = safe_float(measurements.get("active_energy_kWh"))

    meta = {
        "plant": topology["plant"],
        "unit_name": topology["unit_name"],
        "production_line": topology["production_line"],
        "area": topology["area"],
        "equipment": topology["equipment"],
        "source": "dataplatform",
        "timestamp": timestamp,
        "voltage": voltage,
        "frequency": frequency,
        "power_factor": power_factor,
        "thd": thd_voltage,
    }

    records = []

    if voltage is not None and current is not None and power_factor is not None:
        kw = round(voltage * current * power_factor / 1000, 3)

        records.append(
            {
                **meta,
                "energy_name": "Electricity",
                "value": kw,
                "unit": "kW",
            }
        )

    if active_kwh is not None:
        records.append(
            {
                **meta,
                "energy_name": "Electricity-kWh",
                "value": active_kwh,
                "unit": "kWh",
            }
        )

    for key, value in measurements.items():
        if key in POWER_QUALITY_KEYS:
            continue

        if key == "active_energy_kWh":
            continue

        if isinstance(value, (int, float)):
            records.append(
                {
                    **meta,
                    "energy_name": normalize_energy_name(key),
                    "value": float(value),
                    "unit": infer_unit(key),
                }
            )

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
        or "Plant 1",

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

    client.subscribe("ems/meters/#", qos=1)

    print("✅ Subscribed: ems/meters/#")


def on_message(client, userdata, msg):
    try:
        raw = json.loads(msg.payload.decode("utf-8"))

        if "measurements" not in raw:
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