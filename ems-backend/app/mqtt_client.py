

import json
import time
import asyncio
import paho.mqtt.client as mqtt

from app.core.config import MQTT_BROKER, MQTT_PORT, MQTT_TOPIC
from app.db import SessionLocal
from app.models import Alarm, EnergyHistory, TelemetryRecord
from app.utils import (
    calculate_cost,
    generate_alarm_candidates,
    normalize_energy_name,
    normalize_line_name,
)
from app.services.notifications import send_alarm_email

# Import du manager WebSocket (lazy pour éviter les imports circulaires)
def get_ws_manager():
    try:
        from app.routes.websocket import manager
        return manager
    except Exception:
        return None


def save_telemetry(payload: dict) -> None:
    source = payload.get("source", "mqtt")

    # Rejeter les données du simulateur backend
    if source == "simulator":
        return

    db = SessionLocal()
    try:
        record = TelemetryRecord(
            plant           = payload.get("plant",           "Plant 1"),
            unit_name       = payload.get("unit_name",       "Unit 1"),
            production_line = normalize_line_name(payload["production_line"]),
            area            = payload.get("area",            "Area 1"),
            equipment       = payload.get("equipment",       "Equipment 1"),
            energy_name     = normalize_energy_name(payload["energy_name"]),
            value           = float(payload["value"]),
            unit            = payload["unit"],
            source          = source,
            voltage         = payload.get("voltage"),
            frequency       = payload.get("frequency"),
            power_factor    = payload.get("power_factor"),
            thd             = payload.get("thd"),
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        # Sauvegarder dans l'historique
        history = EnergyHistory(
            plant           = record.plant,
            unit_name       = record.unit_name,
            production_line = record.production_line,
            area            = record.area,
            equipment       = record.equipment,
            energy_name     = record.energy_name,
            value           = record.value,
            unit            = record.unit,
            cost            = calculate_cost(record.energy_name, record.value),
            timestamp       = record.timestamp,
        )
        db.add(history)

        # Générer les alarmes automatiques
        alarm_candidates = generate_alarm_candidates({
            "plant":           record.plant,
            "unit_name":       record.unit_name,
            "production_line": record.production_line,
            "area":            record.area,
            "equipment":       record.equipment,
            "energy_name":     record.energy_name,
            "value":           record.value,
            "voltage":         record.voltage,
            "frequency":       record.frequency,
            "power_factor":    record.power_factor,
            "thd":             record.thd,
        })

        for alarm_data in alarm_candidates:
            db.add(Alarm(**alarm_data))
            # Envoyer email pour alarmes critiques (en arrière-plan)
            if alarm_data.get("severity") == "high":
                try:
                    send_alarm_email(alarm_data)
                except Exception as e:
                    print(f"Email notification error: {e}")

        db.commit()

        # Diffuser via WebSocket (temps réel < 1 seconde)
        ws_manager = get_ws_manager()
        if ws_manager and ws_manager.active_connections:
            ws_message = {
                "type":            "telemetry",
                "production_line": record.production_line,
                "energy_name":     record.energy_name,
                "value":           record.value,
                "unit":            record.unit,
                "equipment":       record.equipment,
                "area":            record.area,
                "voltage":         record.voltage,
                "power_factor":    record.power_factor,
                "frequency":       record.frequency,
                "timestamp":       record.timestamp.isoformat(),
                "cost":            calculate_cost(record.energy_name, record.value),
            }
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(ws_manager.broadcast(ws_message))
            except Exception:
                pass

    except Exception as exc:
        db.rollback()
        print(f"DB error saving telemetry: {exc}")
    finally:
        db.close()


def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"✅ Connected to MQTT broker: {MQTT_BROKER}:{MQTT_PORT}")
    client.subscribe(MQTT_TOPIC)
    print(f"✅ Subscribed to: {MQTT_TOPIC}")


def on_message(client, userdata, msg):
    try:
        payload  = json.loads(msg.payload.decode("utf-8"))
        required = ["production_line", "energy_name", "value", "unit"]
        missing  = [k for k in required if k not in payload]

        if missing:
            print(f"Invalid payload, missing: {missing}")
            return

        save_telemetry(payload)

    except json.JSONDecodeError:
        print("Invalid JSON payload")
    except Exception as exc:
        print(f"MQTT message error: {exc}")


def start_mqtt():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message

    retries = 0
    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            break
        except Exception as exc:
            retries += 1
            wait = min(30, retries * 3)
            print(f"⏳ MQTT not ready, retry in {wait}s... ({exc})")
            time.sleep(wait)

    client.loop_start()
    return client