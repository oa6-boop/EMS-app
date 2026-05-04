import json
import random
import time

import paho.mqtt.client as mqtt

MQTT_BROKER = "localhost"
MQTT_PORT = 1883

LINES = [
    "Production Line 1",
    "Production Line 2",
    "Production Line 3",
    "Production Line 4",
]

ENERGIES = [
    ("Électricité", "kWh", 42000, 48000),
    ("Eau", "m³", 1100, 1500),
    ("CO₂", "tCO₂e", 10, 25),
    ("Vapeur", "t", 250, 380),
    ("Énergie Solaire", "kWh", 120, 700),
    ("Fuel", "L", 300, 1500),
]

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect(MQTT_BROKER, MQTT_PORT, 60)
client.loop_start()

print("Simulator started successfully")

while True:
    for line in LINES:
        for energy_name, unit, minimum, maximum in ENERGIES:
            payload = {
                "production_line": line,
                "energy_name": energy_name,
                "value": round(random.uniform(minimum, maximum), 2),
                "unit": unit,
                "source": "simulator",
            }

            topic = f"ems/telemetry/{line.replace(' ', '_')}/{energy_name.replace(' ', '_')}"
            client.publish(topic, json.dumps(payload))
            print("Published:", topic, payload)

    time.sleep(3)