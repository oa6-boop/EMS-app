"""
threshold_alerts.py — EMS JESA

Flink job:
- Lit les données DataPlatform depuis Kafka topic ems.meters.1
- Détecte les anomalies temps réel
- Publie les alarmes dans Kafka topic ems.alerts

Alarmes générées:
- UNDERVOLTAGE
- OVERVOLTAGE
- UNDERFREQUENCY
- OVERFREQUENCY
- LOW_POWER_FACTOR
- HIGH_THD
- HIGH_CONSUMPTION
"""

import json
import os
from datetime import datetime

from pyflink.datastream import StreamExecutionEnvironment, RuntimeExecutionMode
from pyflink.datastream.connectors.kafka import (
    KafkaSource,
    KafkaSink,
    KafkaRecordSerializationSchema,
    KafkaOffsetsInitializer,
)
from pyflink.datastream.functions import KeyedProcessFunction
from pyflink.datastream.state import ValueStateDescriptor
from pyflink.common import WatermarkStrategy, Types
from pyflink.common.serialization import SimpleStringSchema


KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
INPUT_TOPIC = "ems.meters.1"
OUTPUT_TOPIC = "ems.alerts"

VOLTAGE_MIN = float(os.getenv("VOLTAGE_MIN", "210.0"))
VOLTAGE_MAX = float(os.getenv("VOLTAGE_MAX", "250.0"))
FREQUENCY_MIN = float(os.getenv("FREQUENCY_MIN", "49.5"))
FREQUENCY_MAX = float(os.getenv("FREQUENCY_MAX", "50.5"))
POWER_FACTOR_MIN = float(os.getenv("POWER_FACTOR_MIN", "0.80"))
THD_MAX = float(os.getenv("THD_MAX", "8.0"))
HIGH_CONSUMPTION_KW = float(os.getenv("HIGH_CONSUMPTION_KW", "20.0"))

# 0 = alarme immédiate. C'est mieux pour ton test.
SUSTAINED_MS = int(os.getenv("SUSTAINED_MS", "0"))


def safe_float(value, default=None):
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def now_iso():
    return datetime.utcnow().isoformat() + "Z"


def build_alarm(
    device_id,
    device_name,
    alarm_type,
    priority,
    value,
    threshold,
    unit,
    message,
) -> str:
    return json.dumps(
        {
            "event_type": "AlarmEvent",
            "source": "flink",
            "device_id": device_id,
            "device_name": device_name,
            "alarm_type": alarm_type,
            "priority": priority,
            "value": round(float(value), 3),
            "threshold": str(threshold),
            "unit": unit,
            "message": message,
            "timestamp": now_iso(),
        }
    )


class ThresholdAlertFunction(KeyedProcessFunction):
    """
    Détection par device_id.

    Voltage et fréquence peuvent être immédiats si SUSTAINED_MS=0.
    Power factor, THD et consommation sont immédiats.
    """

    def open(self, runtime_context):
        self.voltage_fault_start = runtime_context.get_state(
            ValueStateDescriptor("voltage_fault_start", Types.LONG())
        )
        self.frequency_fault_start = runtime_context.get_state(
            ValueStateDescriptor("frequency_fault_start", Types.LONG())
        )

    def process_element(self, raw_value, ctx: KeyedProcessFunction.Context):
        try:
            msg = json.loads(raw_value)

            device_id = msg.get("device_id", "unknown")
            device_name = msg.get("device_name", device_id)

            measurements = msg.get("measurements", {})

            if not isinstance(measurements, dict) or not measurements:
                return

            voltage = safe_float(measurements.get("voltage_V"))
            frequency = safe_float(measurements.get("frequency_Hz"))
            current = safe_float(measurements.get("current_A"))
            power_factor = safe_float(measurements.get("power_factor"))
            thd_voltage = safe_float(measurements.get("thd_voltage_pct"))

            now_ms = ctx.timestamp() or int(datetime.utcnow().timestamp() * 1000)

            # 1. Voltage
            if voltage is not None:
                voltage_out = voltage < VOLTAGE_MIN or voltage > VOLTAGE_MAX

                if voltage_out:
                    if self.voltage_fault_start.value() is None:
                        self.voltage_fault_start.update(now_ms)

                    fault_start = self.voltage_fault_start.value() or now_ms
                    duration_ms = now_ms - fault_start

                    if duration_ms >= SUSTAINED_MS:
                        alarm_type = (
                            "UNDERVOLTAGE"
                            if voltage < VOLTAGE_MIN
                            else "OVERVOLTAGE"
                        )

                        limit = VOLTAGE_MIN if voltage < VOLTAGE_MIN else VOLTAGE_MAX

                        priority = "HIGH" if voltage < 180 or voltage > 270 else "MEDIUM"

                        yield build_alarm(
                            device_id=device_id,
                            device_name=device_name,
                            alarm_type=alarm_type,
                            priority=priority,
                            value=voltage,
                            threshold=f"{VOLTAGE_MIN}–{VOLTAGE_MAX} V",
                            unit="V",
                            message=(
                                f"{device_name}: voltage {voltage:.1f}V is "
                                f"{'below minimum' if voltage < VOLTAGE_MIN else 'above maximum'} "
                                f"{limit}V."
                            ),
                        )

                        self.voltage_fault_start.clear()
                else:
                    self.voltage_fault_start.clear()

            # 2. Frequency
            if frequency is not None:
                frequency_out = frequency < FREQUENCY_MIN or frequency > FREQUENCY_MAX

                if frequency_out:
                    if self.frequency_fault_start.value() is None:
                        self.frequency_fault_start.update(now_ms)

                    fault_start = self.frequency_fault_start.value() or now_ms
                    duration_ms = now_ms - fault_start

                    if duration_ms >= SUSTAINED_MS:
                        alarm_type = (
                            "UNDERFREQUENCY"
                            if frequency < FREQUENCY_MIN
                            else "OVERFREQUENCY"
                        )

                        limit = (
                            FREQUENCY_MIN
                            if frequency < FREQUENCY_MIN
                            else FREQUENCY_MAX
                        )

                        yield build_alarm(
                            device_id=device_id,
                            device_name=device_name,
                            alarm_type=alarm_type,
                            priority="HIGH",
                            value=frequency,
                            threshold=f"{FREQUENCY_MIN}–{FREQUENCY_MAX} Hz",
                            unit="Hz",
                            message=(
                                f"{device_name}: frequency {frequency:.2f}Hz is "
                                f"{'below minimum' if frequency < FREQUENCY_MIN else 'above maximum'} "
                                f"{limit}Hz."
                            ),
                        )

                        self.frequency_fault_start.clear()
                else:
                    self.frequency_fault_start.clear()

            # 3. Low Power Factor
            if power_factor is not None and power_factor < POWER_FACTOR_MIN:
                priority = "HIGH" if power_factor <= 0.70 else "MEDIUM"

                yield build_alarm(
                    device_id=device_id,
                    device_name=device_name,
                    alarm_type="LOW_POWER_FACTOR",
                    priority=priority,
                    value=power_factor,
                    threshold=POWER_FACTOR_MIN,
                    unit="",
                    message=(
                        f"{device_name}: power factor {power_factor:.3f} "
                        f"below minimum {POWER_FACTOR_MIN}. "
                        f"Reactive power compensation required."
                    ),
                )

            # 4. High THD
            if thd_voltage is not None and thd_voltage > THD_MAX:
                priority = "HIGH" if thd_voltage > 12.0 else "MEDIUM"

                yield build_alarm(
                    device_id=device_id,
                    device_name=device_name,
                    alarm_type="HIGH_THD",
                    priority=priority,
                    value=thd_voltage,
                    threshold=THD_MAX,
                    unit="%",
                    message=(
                        f"{device_name}: THD voltage {thd_voltage:.1f}% "
                        f"exceeds {THD_MAX}%."
                    ),
                )

            # 5. High Consumption
            if (
                voltage is not None
                and current is not None
                and power_factor is not None
            ):
                active_power_kw = round(voltage * current * power_factor / 1000, 3)

                if active_power_kw > HIGH_CONSUMPTION_KW:
                    yield build_alarm(
                        device_id=device_id,
                        device_name=device_name,
                        alarm_type="HIGH_CONSUMPTION",
                        priority="MEDIUM",
                        value=active_power_kw,
                        threshold=HIGH_CONSUMPTION_KW,
                        unit="kW",
                        message=(
                            f"{device_name}: active power {active_power_kw:.2f}kW "
                            f"exceeds threshold {HIGH_CONSUMPTION_KW}kW."
                        ),
                    )

        except json.JSONDecodeError as error:
            print(f"[WARN] Bad JSON from Kafka: {error}")

        except Exception as error:
            print(f"[ERROR] ThresholdAlertFunction error: {error} | raw={str(raw_value)[:120]}")


def main():
    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_runtime_mode(RuntimeExecutionMode.STREAMING)
    env.set_parallelism(1)

    source = (
        KafkaSource.builder()
        .set_bootstrap_servers(KAFKA_BROKER)
        .set_topics(INPUT_TOPIC)
        .set_group_id("flink-threshold-monitor-v3")
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

    stream = env.from_source(
        source,
        WatermarkStrategy.no_watermarks(),
        "Kafka Source: ems.meters.1",
    )

    alerts = (
        stream
        .filter(lambda raw: raw is not None and raw.strip() != "")
        .key_by(lambda raw: json.loads(raw).get("device_id", "unknown"))
        .process(ThresholdAlertFunction())
        .map(lambda alarm: str(alarm), output_type=Types.STRING())
    )

    alerts.sink_to(sink)

    print("[FLINK] EMS Threshold Alert Monitor v3")
    print(f"[FLINK] Kafka: {KAFKA_BROKER}")
    print(f"[FLINK] Input: {INPUT_TOPIC}")
    print(f"[FLINK] Output: {OUTPUT_TOPIC}")
    print(
        f"[FLINK] V=[{VOLTAGE_MIN},{VOLTAGE_MAX}]V | "
        f"Hz=[{FREQUENCY_MIN},{FREQUENCY_MAX}] | "
        f"PF>={POWER_FACTOR_MIN} | THD<={THD_MAX}% | "
        f"Consumption<={HIGH_CONSUMPTION_KW}kW | "
        f"SUSTAINED_MS={SUSTAINED_MS}"
    )

    env.execute("EMS Threshold Alert Monitor v3")


if __name__ == "__main__":
    main()