"""
peak_demand_processor.py — EMS JESA
Job Flink : suit le pic de puissance (peak demand) par appareil
depuis ems.meters.1 et publie dans ems.metrics.
"""

import json
import os
from datetime import datetime

from pyflink.datastream import StreamExecutionEnvironment, RuntimeExecutionMode
from pyflink.datastream.connectors.kafka import (
    KafkaSource, KafkaSink, KafkaRecordSerializationSchema,
    KafkaOffsetsInitializer,
)
from pyflink.datastream.functions import KeyedProcessFunction
from pyflink.datastream.state import ValueStateDescriptor
from pyflink.common import WatermarkStrategy, Types
from pyflink.common.serialization import SimpleStringSchema


KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
INPUT_TOPIC  = "ems.meters.1"
OUTPUT_TOPIC = "ems.metrics"


def safe_float(v, d=None):
    try:
        return float(v) if v is not None else d
    except Exception:
        return d


def now_iso():
    return datetime.utcnow().isoformat() + "Z"


class PeakDemandProcessor(KeyedProcessFunction):
    """Garde en memoire le pic de puissance atteint par chaque appareil."""

    def open(self, runtime_context):
        self.peak_state = runtime_context.get_state(
            ValueStateDescriptor("peak_kw", Types.FLOAT())
        )

    def process_element(self, raw_value, ctx):
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

            active_power_kw = round(voltage * current * power_factor / 1000, 3)

            previous_peak = self.peak_state.value()

            # Nouveau pic detecte
            if previous_peak is None or active_power_kw > previous_peak:
                self.peak_state.update(active_power_kw)

                yield json.dumps({
                    "event_type":  "MetricEvent",
                    "source":      "flink",
                    "device_id":   device_id,
                    "device_name": device_name,
                    "metric_name": "peak_demand_kW",
                    "value":       active_power_kw,
                    "unit":        "kW",
                    "timestamp":   now_iso(),
                })

        except json.JSONDecodeError as e:
            print(f"[WARN] Bad JSON: {e}")
        except Exception as e:
            print(f"[ERROR] PeakDemandProcessor: {e}")


def main():
    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_runtime_mode(RuntimeExecutionMode.STREAMING)
    env.set_parallelism(1)

    source = (
        KafkaSource.builder()
        .set_bootstrap_servers(KAFKA_BROKER)
        .set_topics(INPUT_TOPIC)
        .set_group_id("flink-peak-demand-v1")
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

    peaks = (
        stream
        .filter(lambda raw: raw is not None and raw.strip() != "")
        .key_by(lambda raw: json.loads(raw).get("device_id", "unknown"))
        .process(PeakDemandProcessor())
        .map(lambda s: str(s), output_type=Types.STRING())
    )

    peaks.sink_to(sink)

    print(f"[FLINK] EMS Peak Demand Processor v1")
    print(f"[FLINK] {INPUT_TOPIC} -> {OUTPUT_TOPIC} on {KAFKA_BROKER}")

    env.execute("EMS Peak Demand Processor v1")


if __name__ == "__main__":
    main()