

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.db import get_db
from app.models import TelemetryRecord
from app.utils import calculate_cost, calculate_co2, CO2_FACTOR_KG_PER_KWH

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/aggregate/{line_name}")
def get_aggregated_history(
    line_name:   str,
    period:      str = Query(default="day", enum=["hour", "day", "week", "month", "year"]),
    energy_name: str = Query(default="Electricity"),
    db: Session = Depends(get_db),
):
    """
    Retourne les données historiques agrégées pour une ligne.
    - hour  : dernière heure
    - day   : dernier jour
    - week  : dernière semaine
    - month : dernier mois
    - year  : dernière année
    """
    now = datetime.utcnow()

    ranges = {
        "hour":  now - timedelta(hours=1),
        "day":   now - timedelta(days=1),
        "week":  now - timedelta(weeks=1),
        "month": now - timedelta(days=30),
        "year":  now - timedelta(days=365),
    }
    start = ranges[period]

    records = (
        db.query(TelemetryRecord)
        .filter(
            TelemetryRecord.production_line == line_name,
            TelemetryRecord.energy_name     == energy_name,
            TelemetryRecord.timestamp       >= start,
            TelemetryRecord.source          != "simulator",
        )
        .order_by(TelemetryRecord.timestamp)
        .all()
    )

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
                "timestamp": t,
                "value":     v,
                "cost":      c,
                "co2_kg":    co2,
            }
            for t, v, c, co2 in zip(timestamps, values, costs, co2_values)
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
    db: Session = Depends(get_db),
):
    """
    Comparaison aujourd'hui vs hier.
    Retourne les deux séries pour affichage côte à côte.
    """
    now       = datetime.utcnow()
    today_start     = now - timedelta(hours=24)
    yesterday_start = now - timedelta(hours=48)
    yesterday_end   = now - timedelta(hours=24)

    def get_records(start, end):
        return (
            db.query(TelemetryRecord)
            .filter(
                TelemetryRecord.production_line == line_name,
                TelemetryRecord.energy_name     == energy_name,
                TelemetryRecord.timestamp       >= start,
                TelemetryRecord.timestamp       < end,
                TelemetryRecord.source          != "simulator",
            )
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

    # Calcul variation
    variation = 0.0
    if yesterday_data["avg"] > 0:
        variation = round(
            (today_data["avg"] - yesterday_data["avg"]) / yesterday_data["avg"] * 100, 1
        )

    return {
        "line_name":   line_name,
        "energy_name": energy_name,
        "today":       today_data,
        "yesterday":   yesterday_data,
        "variation_pct": variation,
        "trend": "increasing" if variation > 5 else "decreasing" if variation < -5 else "stable",
    }


@router.get("/summary")
def get_all_lines_summary(
    period: str = Query(default="day", enum=["hour", "day", "week", "month"]),
    db: Session = Depends(get_db),
):
    """
    Résumé de toutes les lignes pour la période donnée.
    Utilisé par le Dashboard pour la comparaison inter-lignes.
    """
    from sqlalchemy import distinct
    now   = datetime.utcnow()
    start = now - {"hour": timedelta(hours=1), "day": timedelta(days=1), "week": timedelta(weeks=1), "month": timedelta(days=30)}[period]

    lines = [r[0] for r in db.query(distinct(TelemetryRecord.production_line)).all() if r[0]]
    result = {}

    for line in sorted(lines):
        records = (
            db.query(TelemetryRecord)
            .filter(
                TelemetryRecord.production_line == line,
                TelemetryRecord.timestamp       >= start,
                TelemetryRecord.source          != "simulator",
            )
            .order_by(desc(TelemetryRecord.timestamp))
            .limit(100)
            .all()
        )

        kw_vals = [r.value for r in records if r.unit == "kW"]
        costs   = [calculate_cost(r.energy_name, r.value) for r in records]
        co2s    = [calculate_co2(r.energy_name, r.value, r.unit) for r in records]

        result[line] = {
            "avg_kw":     round(sum(kw_vals) / len(kw_vals), 2) if kw_vals else 0,
            "max_kw":     round(max(kw_vals), 2) if kw_vals else 0,
            "total_cost": round(sum(costs), 4),
            "total_co2":  round(sum(co2s), 3),
            "records":    len(records),
        }

    return {"period": period, "lines": result}