from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, distinct
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.core.deps import get_current_active_user
from app.db import get_db
from app.models import TelemetryRecord
from app.utils import calculate_cost, calculate_co2

router = APIRouter(prefix="/api/history", tags=["history"],
                   dependencies=[Depends(get_current_active_user)])

ELEC_RATE_MAD = 1.40          # tarif électricité ONEE
CO2_FACTOR    = 0.718         # facteur ONEE Maroc

# Map nom logique → (nom exact, unité) pour ne PAS mélanger
# "Electricity" (kW, puissance) avec "Electricity-kWh" (compteur cumulé)
ENERGY_FILTERS = {
    "Electricity":     ("Electricity", "kW"),
    "Electricity-kWh": ("Electricity-kWh", "kWh"),
    "CO2-Emissions":   ("CO2-Emissions", None),
}


def apply_context_filters(q, plant: str | None = None, zone: str | None = None, equipment: str | None = None, tag: str | None = None):
    """Filtre commun Plant / Zone / Equipment / Tag.

    Le tag vient de la DataPlatform et il est stocke dans telemetry_records.tags
    sous forme de chaine separee par virgules: "pump,critical,water".
    """
    if plant:
        q = q.filter(TelemetryRecord.plant.ilike(plant))
    if zone:
        q = q.filter(TelemetryRecord.area.ilike(zone))
    if equipment:
        q = q.filter(TelemetryRecord.equipment.ilike(equipment))
    if tag:
        tag_clean = tag.strip().lower()
        q = q.filter(TelemetryRecord.tags.ilike(f"%{tag_clean}%"))
    return q


def filtered_query(db, line_name, energy_name, start=None, plant=None, zone=None, equipment=None, tag=None):
    q = db.query(TelemetryRecord).filter(
        TelemetryRecord.production_line == line_name,
        TelemetryRecord.source != "simulator",
    )
    if start is not None:
        q = q.filter(TelemetryRecord.timestamp >= start)

    q = apply_context_filters(q, plant=plant, zone=zone, equipment=equipment, tag=tag)

    target = ENERGY_FILTERS.get(energy_name)
    if target:
        exact_name, exact_unit = target
        q = q.filter(TelemetryRecord.energy_name == exact_name)
        if exact_unit:
            q = q.filter(TelemetryRecord.unit == exact_unit)
    else:
        q = q.filter(TelemetryRecord.energy_name.ilike(f"%{energy_name.split('-')[0]}%"))
    return q


@router.get("/aggregate/{line_name}")
def get_aggregated_history(
    line_name:   str,
    period:      str = Query(default="day", enum=["hour", "day", "week", "month", "year"]),
    energy_name: str = Query(default="Electricity"),
    plant: str | None = Query(default=None),
    zone: str | None = Query(default=None),
    equipment: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    now    = datetime.utcnow()
    ranges = {
        "hour":  now - timedelta(hours=1),
        "day":   now - timedelta(days=1),
        "week":  now - timedelta(weeks=1),
        "month": now - timedelta(days=30),
        "year":  now - timedelta(days=365),
    }
    start = ranges[period]

    records = filtered_query(
        db, line_name, energy_name, start,
        plant=plant, zone=zone, equipment=equipment, tag=tag,
    ).order_by(TelemetryRecord.timestamp).all()

    if not records:
        return {
            "period":      period,
            "line_name":   line_name,
            "energy_name": energy_name,
            "data":        [],
            "stats":       {},
        }

    values     = [r.value for r in records]
    timestamps = [r.timestamp.isoformat() for r in records]
    costs      = [calculate_cost(r.energy_name, r.value) for r in records]
    co2_values = [calculate_co2(r.energy_name, r.value, r.unit) for r in records]

    return {
        "period":      period,
        "line_name":   line_name,
        "energy_name": energy_name,
        "data": [
            {
                "timestamp":   t,
                "value":       v,
                "cost":        c,
                "co2_kg":      co2,
                "energy_name": records[i].energy_name,
                "unit":        records[i].unit,
            }
            for i, (t, v, c, co2) in enumerate(zip(timestamps, values, costs, co2_values))
        ],
        "stats": {
            "min":        round(min(values), 2),
            "max":        round(max(values), 2),
            "avg":        round(sum(values) / len(values), 2),
            "total_cost": round(sum(costs), 4),
            "total_co2":  round(sum(co2_values), 3),
            "count":      len(values),
            "start":      start.isoformat(),
            "end":        now.isoformat(),
        },
    }


@router.get("/compare/{line_name}")
def get_comparison(
    line_name:   str,
    energy_name: str = Query(default="Electricity"),
    plant: str | None = Query(default=None),
    zone: str | None = Query(default=None),
    equipment: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    now             = datetime.utcnow()
    today_start     = now - timedelta(hours=24)
    yesterday_start = now - timedelta(hours=48)
    yesterday_end   = now - timedelta(hours=24)

    def get_records(start, end):
        return (
            filtered_query(
                db, line_name, energy_name, start,
                plant=plant, zone=zone, equipment=equipment, tag=tag,
            )
            .filter(TelemetryRecord.timestamp < end)
            .order_by(TelemetryRecord.timestamp)
            .all()
        )

    today_records     = get_records(today_start,     now)
    yesterday_records = get_records(yesterday_start, yesterday_end)

    def summarize(records):
        if not records:
            return {"values": [], "timestamps": [], "avg": 0, "max": 0, "total_cost": 0}
        values = [r.value for r in records]
        return {
            "values":     values,
            "timestamps": [r.timestamp.isoformat() for r in records],
            "avg":        round(sum(values) / len(values), 2),
            "max":        round(max(values), 2),
            "total_cost": round(sum(calculate_cost(r.energy_name, r.value) for r in records), 4),
        }

    today_data     = summarize(today_records)
    yesterday_data = summarize(yesterday_records)

    variation = 0.0
    if yesterday_data["avg"] > 0:
        variation = round(
            (today_data["avg"] - yesterday_data["avg"]) / yesterday_data["avg"] * 100, 1
        )

    return {
        "line_name":     line_name,
        "energy_name":   energy_name,
        "today":         today_data,
        "yesterday":     yesterday_data,
        "variation_pct": variation,
        "trend": "increasing" if variation > 5 else "decreasing" if variation < -5 else "stable",
    }


@router.get("/summary")
def get_all_lines_summary(
    period: str = Query(default="day", enum=["hour", "day", "week", "month"]),
    plant: str | None = Query(default=None),
    zone: str | None = Query(default=None),
    equipment: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    now   = datetime.utcnow()
    start = now - {
        "hour":  timedelta(hours=1),
        "day":   timedelta(days=1),
        "week":  timedelta(weeks=1),
        "month": timedelta(days=30),
    }[period]

    lines  = [r[0] for r in db.query(distinct(TelemetryRecord.production_line)).all() if r[0]]
    result = {}

    for line in sorted(lines):
        records_query = (
            db.query(TelemetryRecord)
            .filter(
                TelemetryRecord.production_line == line,
                TelemetryRecord.timestamp       >= start,
                TelemetryRecord.source          != "simulator",
            )
        )
        records_query = apply_context_filters(
            records_query, plant=plant, zone=zone, equipment=equipment, tag=tag
        )
        records = (
            records_query
            .order_by(desc(TelemetryRecord.timestamp))
            .limit(200)
            .all()
        )

        # Puissance instantanée (kW) — énergie consommée
        kw_vals = [r.value for r in records if r.unit == "kW"]

        # Compteur cumulé (kWh) sur la période → consommation = max - min
        kwh_vals_period = [r.value for r in records if r.unit == "kWh"]
        kwh_start = min(kwh_vals_period) if kwh_vals_period else 0.0
        kwh_end   = max(kwh_vals_period) if kwh_vals_period else 0.0
        consumption_kwh = max(0.0, kwh_end - kwh_start)

        # Compteur cumulé TOTAL (depuis toujours) pour cette ligne
        cumulative_query = (
            db.query(func.max(TelemetryRecord.value))
            .filter(
                TelemetryRecord.production_line == line,
                TelemetryRecord.unit == "kWh",
                TelemetryRecord.source != "simulator",
            )
        )
        cumulative_query = apply_context_filters(
            cumulative_query, plant=plant, zone=zone, equipment=equipment, tag=tag
        )
        cumulative_kwh = cumulative_query.scalar() or 0.0

        # Coûts
        period_cost     = round(consumption_kwh * ELEC_RATE_MAD, 2)   # conso de la période
        cumulative_cost = round(cumulative_kwh * ELEC_RATE_MAD, 2)    # total historique
        period_co2      = round(consumption_kwh * CO2_FACTOR, 3)
        cumulative_co2  = round(cumulative_kwh * CO2_FACTOR, 3)

        avg_kw = round(sum(kw_vals) / len(kw_vals), 2) if kw_vals else 0.0
        max_kw = round(max(kw_vals), 2) if kw_vals else 0.0

        result[line] = {
            "avg_kw":          avg_kw,
            "max_kw":          max_kw,
            "total_cost":      period_cost,        # coût de la période
            "total_co2":       period_co2,         # CO2 de la période
            "consumption_kwh": round(consumption_kwh, 2),
            "cumulative_kwh":  round(cumulative_kwh, 2),   # ← énergie totale consommée
            "cumulative_cost": cumulative_cost,            # ← coût total cumulé
            "cumulative_co2":  cumulative_co2,
            "records":         len(records),
            "stats_kw": {"avg": avg_kw, "max": max_kw,
                         "min": round(min(kw_vals), 2) if kw_vals else 0.0},
        }

    return {"period": period, "lines": result}