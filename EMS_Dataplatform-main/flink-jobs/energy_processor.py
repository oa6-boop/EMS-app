"""
energy_processor.py — EMS JESA
Job Flink : calcule des indicateurs energetiques depuis ems.meters.1
et les publie dans ems.metrics (lus par le backend).

Indicateurs calcules :
  - active_power_kW    : puissance active instantanee
  - SEC                : Specific Energy Consumption (kWh par unite)
"""

import json
import os
from datetime import datetime

from pyflink.datastream import StreamExecutionEnvironment, RuntimeExecutionMode
from pyflink.datastream.connectors.kafka import (
    KafkaSource, KafkaSink, KafkaRecordSerializationSchema,
    KafkaOffsetsInitializer,
)
from pyflink.datastream.functions import FlatMapFunction
from pyflink.common import WatermarkStrategy, Types
from pyflink.common.serialization import SimpleStringSchema


KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
INPUT_TOPIC  = "ems.meters.1"
OUTPUT_TOPIC = "ems.metrics"

# Production estimee par unite de temps (sert au calcul du SEC).
# Valeur indicative ; ajustable selon la ligne de production.
PRODUCTION_UNITS = float(os.getenv("PRODUCTION_UNITS", "10.0"))


def safe_float(v, d=None):
    try:
        return float(v) if v is not None else d
    except Exception:
        return d


def now_iso():
    return datetime.utcnow().isoformat() + "Z"


def build_metric(device_id, device_name, metric_name, value, unit):
    return json.dumps({
        "event_type":  "MetricEvent",
        "source":      "flink",
        "device_id":   device_id,
        "device_name": device_name,
        "metric_name": metric_name,
        "value":       round(float(value), 4),
        "unit":        unit,
        "timestamp":   now_iso(),
    })


class EnergyProcessor(FlatMapFunction):
    """Calcule la puissance active et le SEC pour chaque mesure recue."""

    def flat_map(self, raw_value):
        try:
            msg = json.loads(raw_value)
            device_id   = msg.get("device_id", "unknown")
            device_name = msg.get("device_name", device_id)
            m           = msg.get("measurements", {})

            if not isinstance(m, dict) or not m:
                return

            voltage      = safe_float(m.get("voltage_V"))
            current      = safe_float(m.get("current_A"))
            power_factor = safe_float(m.get("power_factor"))

            if voltage is None or current is None or power_factor is None:
                return

            # Puissance active instantanee (kW)
            active_power_kw = round(voltage * current * power_factor / 1000, 3)

            yield build_metric(
                device_id, device_name,
                "active_power_kW", active_power_kw, "kW",
            )

            # SEC : energie consommee par unite produite (kWh / unite)
            if PRODUCTION_UNITS > 0:
                sec = active_power_kw / PRODUCTION_UNITS
                yield build_metric(
                    device_id, device_name,
                    "SEC", sec, "kWh/unit",
                )

        except json.JSONDecodeError as e:
            print(f"[WARN] Bad JSON: {e}")
        except Exception as e:
            print(f"[ERROR] EnergyProcessor: {e}")


def main():
    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_runtime_mode(RuntimeExecutionMode.STREAMING)
    env.set_parallelism(1)

    source = (
        KafkaSource.builder()
        .set_bootstrap_servers(KAFKA_BROKER)
        .set_topics(INPUT_TOPIC)
        .set_group_id("flink-energy-processor-v1")
        .set_starting_offsets(KafkaOffsetsInitializer.earliest())
        .set_value_only_deserializer(SimpleStringSchema())
        .build()
    )

    sink = (
        KafkaSink.builder()
        .set_bootstrap_servers(KAFKA_BROKER)
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
            .set_topic(OUTPUT_TOPIC)
            .set_value_serialization_schema(SimpleStringSchema())
            .build()
        )
        .build()
    )

    stream = env.from_source(source, WatermarkStrategy.no_watermarks(), "Kafka: ems.meters.1")

    metrics = (
        stream
        .filter(lambda raw: raw is not None and raw.strip() != "")
        .flat_map(EnergyProcessor(), output_type=Types.STRING())
    )

    metrics.sink_to(sink)

    print(f"[FLINK] EMS Energy Processor v1")
    print(f"[FLINK] {INPUT_TOPIC} -> {OUTPUT_TOPIC} on {KAFKA_BROKER}")
    print(f"[FLINK] PRODUCTION_UNITS={PRODUCTION_UNITS}")

    env.execute("EMS Energy Processor v1")


if __name__ == "__main__":
    main()