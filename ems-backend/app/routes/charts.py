from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, distinct
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import TelemetryRecord

CO2_FACTOR_KG_PER_KWH = 0.475

router = APIRouter(prefix="/api/charts", tags=["charts"])


def linear_regression(x_list, y_list):
    n = len(x_list)

    if n < 2:
        return 0.0, y_list[0] if y_list else 0.0

    sum_x = sum(x_list)
    sum_y = sum(y_list)
    sum_xy = sum(x * y for x, y in zip(x_list, y_list))
    sum_xx = sum(x * x for x in x_list)

    denominator = n * sum_xx - sum_x * sum_x

    if abs(denominator) < 1e-10:
        return 0.0, sum_y / n

    slope = (n * sum_xy - sum_x * sum_y) / denominator
    intercept = (sum_y - slope * sum_x) / n

    return slope, intercept


def predict_next(values, steps=5):
    if not values:
        return []

    if len(values) < 2:
        return [round(values[0], 3)] * steps

    x_values = list(range(len(values)))
    slope, intercept = linear_regression(x_values, values)

    predictions = []

    for i in range(1, steps + 1):
        prediction = slope * (len(values) + i - 1) + intercept
        predictions.append(round(max(0.0, prediction), 3))

    return predictions


def predict_with_ci(values, steps=5):
    if not values or len(values) < 2:
        value = values[0] if values else 0.0

        return {
            "predictions": [round(value, 3)] * steps,
            "ci_low": [round(max(0.0, value * 0.95), 3)] * steps,
            "ci_high": [round(value * 1.05, 3)] * steps,
        }

    x_values = list(range(len(values)))
    slope, intercept = linear_regression(x_values, values)

    residuals = []

    for i in range(len(values)):
        predicted_value = slope * x_values[i] + intercept
        residuals.append(values[i] - predicted_value)

    variance = sum(r ** 2 for r in residuals) / max(len(residuals) - 2, 1)
    std_res = variance ** 0.5

    predictions = []
    ci_low = []
    ci_high = []

    for i in range(1, steps + 1):
        prediction = slope * (len(values) + i - 1) + intercept
        prediction = max(0.0, prediction)
        margin = 2 * std_res * (1 + i * 0.15)

        predictions.append(round(prediction, 3))
        ci_low.append(round(max(0.0, prediction - margin), 3))
        ci_high.append(round(prediction + margin, 3))

    return {
        "predictions": predictions,
        "ci_low": ci_low,
        "ci_high": ci_high,
    }


def calculate_statistics(values):
    if not values:
        return {
            "min": 0,
            "max": 0,
            "avg": 0,
            "std": 0,
            "trend": "stable",
        }

    count = len(values)
    minimum = min(values)
    maximum = max(values)
    average = sum(values) / count
    std = (sum((value - average) ** 2 for value in values) / count) ** 0.5

    half = count // 2
    trend = "stable"

    if half > 0:
        avg_1 = sum(values[:half]) / half
        avg_2 = sum(values[half:]) / max(count - half, 1)
        diff_pct = (avg_2 - avg_1) / (avg_1 + 0.001) * 100

        if diff_pct > 5:
            trend = "increasing"
        elif diff_pct < -5:
            trend = "decreasing"

    return {
        "min": round(minimum, 3),
        "max": round(maximum, 3),
        "avg": round(average, 3),
        "std": round(std, 3),
        "trend": trend,
    }


def confidence_score(values):
    if len(values) < 3:
        return 50.0

    stats = calculate_statistics(values)
    coefficient_variation = stats["std"] / (stats["avg"] + 0.001)

    return round(max(0.0, min(100.0, 100.0 - coefficient_variation * 100.0)), 1)


@router.get("/realtime/{line_name}")
def get_realtime_charts(
    line_name: str,
    limit: int = Query(default=30, ge=5, le=100),
    db: Session = Depends(get_db),
):
    records = (
        db.query(TelemetryRecord)
        .filter(
            TelemetryRecord.production_line == line_name,
            TelemetryRecord.voltage.isnot(None),
            TelemetryRecord.source != "simulator",
        )
        .order_by(desc(TelemetryRecord.timestamp))
        .limit(limit)
        .all()
    )

    records = list(reversed(records))

    voltages = [record.voltage for record in records if record.voltage is not None]
    power_factors = [record.power_factor for record in records if record.power_factor is not None]
    frequencies = [record.frequency if record.frequency is not None else 50.0 for record in records]
    active_power_values = [record.value for record in records if record.unit == "kW"]
    timestamps = [record.timestamp.isoformat() for record in records]

    return {
        "line_name": line_name,
        "data_points": len(records),
        "timestamps": timestamps,
        "voltage": {
            "values": voltages,
            "predictions": predict_next(voltages, 5),
            "stats": calculate_statistics(voltages),
            "nominal": 415.0,
            "unit": "V",
            "min_alarm": 380,
            "max_alarm": 440,
            "label": "Voltage",
            "color": "#4299e1",
        },
        "power_factor": {
            "values": power_factors,
            "predictions": predict_next(power_factors, 5),
            "stats": calculate_statistics(power_factors),
            "nominal": 0.95,
            "unit": "",
            "min_alarm": 0.85,
            "max_alarm": None,
            "label": "Power Factor",
            "color": "#9f7aea",
        },
        "active_power": {
            "values": active_power_values,
            "predictions": predict_next(active_power_values, 5),
            "stats": calculate_statistics(active_power_values),
            "nominal": None,
            "unit": "kW",
            "min_alarm": None,
            "max_alarm": 500,
            "label": "Active Power",
            "color": "#ed8936",
        },
        "frequency": {
            "values": frequencies,
            "predictions": predict_next(frequencies, 5),
            "stats": calculate_statistics(frequencies),
            "nominal": 50.0,
            "unit": "Hz",
            "min_alarm": 49.0,
            "max_alarm": 51.0,
            "label": "Frequency",
            "color": "#38b2ac",
        },
    }


@router.get("/predictions/{line_name}")
def get_predictions(
    line_name: str,
    horizon: int = Query(default=10, ge=3, le=30),
    db: Session = Depends(get_db),
):
    records = (
        db.query(TelemetryRecord)
        .filter(
            TelemetryRecord.production_line == line_name,
            TelemetryRecord.voltage.isnot(None),
            TelemetryRecord.source != "simulator",
        )
        .order_by(desc(TelemetryRecord.timestamp))
        .limit(50)
        .all()
    )

    records = list(reversed(records))

    voltages = [record.voltage for record in records if record.voltage is not None]
    power_factors = [record.power_factor for record in records if record.power_factor is not None]
    active_power_values = [record.value for record in records if record.unit == "kW"]

    voltage_prediction = predict_with_ci(voltages, horizon)
    power_factor_prediction = predict_with_ci(power_factors, horizon)
    active_power_prediction = predict_with_ci(active_power_values, horizon)

    return {
        "line_name": line_name,
        "horizon": horizon,
        "voltage": {
            "predictions": voltage_prediction["predictions"],
            "ci_low": voltage_prediction["ci_low"],
            "ci_high": voltage_prediction["ci_high"],
            "confidence": confidence_score(voltages),
            "stats": calculate_statistics(voltages),
            "unit": "V",
        },
        "power_factor": {
            "predictions": power_factor_prediction["predictions"],
            "ci_low": power_factor_prediction["ci_low"],
            "ci_high": power_factor_prediction["ci_high"],
            "confidence": confidence_score(power_factors),
            "stats": calculate_statistics(power_factors),
            "unit": "",
        },
        "active_power": {
            "predictions": active_power_prediction["predictions"],
            "ci_low": active_power_prediction["ci_low"],
            "ci_high": active_power_prediction["ci_high"],
            "confidence": confidence_score(active_power_values),
            "stats": calculate_statistics(active_power_values),
            "unit": "kW",
        },
    }


@router.get("/comparison")
def get_lines_comparison(db: Session = Depends(get_db)):
    lines_query = db.query(distinct(TelemetryRecord.production_line)).all()
    lines = [row[0] for row in lines_query if row[0]]

    result = {}

    for line in sorted(lines):
        records = (
            db.query(TelemetryRecord)
            .filter(
                TelemetryRecord.production_line == line,
                TelemetryRecord.source != "simulator",
            )
            .order_by(desc(TelemetryRecord.timestamp))
            .limit(50)
            .all()
        )

        kw_values = [record.value for record in records if record.unit == "kW"]
        kwh_values = [record.value for record in records if record.unit == "kWh"]
        voltages = [record.voltage for record in records if record.voltage is not None]
        power_factors = [record.power_factor for record in records if record.power_factor is not None]

        latest_kwh = max(kwh_values) if kwh_values else 0.0
        total_co2 = round(latest_kwh * CO2_FACTOR_KG_PER_KWH, 3)
        total_cost = round(latest_kwh * 0.14, 4)

        line_data = {
            "stats_kw": calculate_statistics(kw_values),
            "stats_voltage": calculate_statistics(voltages),
            "stats_pf": calculate_statistics(power_factors),
            "latest_kwh": round(latest_kwh, 2),
            "total_co2": total_co2,
            "total_cost": total_cost,
            "record_count": len(records),
            "kw_prediction": predict_next(kw_values, 3),
        }

        result[line] = line_data

    return result
