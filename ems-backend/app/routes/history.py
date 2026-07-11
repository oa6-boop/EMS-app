import os
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, distinct
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.core.deps import get_current_active_user
from app.db import get_db
from app.models import TelemetryRecord, EnergyHistory
from app.utils import calculate_cost, calculate_co2, is_aggregate_rollup

router = APIRouter(prefix="/api/history", tags=["history"],
                   dependencies=[Depends(get_current_active_user)])

ELEC_RATE_MAD = 1.40          # tarif électricité ONEE
CO2_FACTOR    = float(os.getenv("CO2_FACTOR_KG_PER_KWH", "0.718"))  # ONEE Maroc — configurable

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

    # PERF : plafonné à 2000 points (les plus récents de la période) —
    # charger des centaines de milliers de lignes gelait la page et le réseau.
    records = filtered_query(
        db, line_name, energy_name, start,
        plant=plant, zone=zone, equipment=equipment, tag=tag,
    ).order_by(desc(TelemetryRecord.timestamp)).limit(2000).all()
    records.reverse()

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
        # PERF : 1500 points max par fenêtre de 24 h — suffisant pour les
        # graphes, et évite de transférer des mégaoctets à chaque affichage.
        rows = (
            filtered_query(
                db, line_name, energy_name, start,
                plant=plant, zone=zone, equipment=equipment, tag=tag,
            )
            .filter(TelemetryRecord.timestamp < end)
            .order_by(desc(TelemetryRecord.timestamp))
            .limit(1500)
            .all()
        )
        rows.reverse()
        return rows

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

        # Consommation kWh de la période : delta (max - min) PAR équipement,
        # sommé sur les équipements PHYSIQUES. On ne mélange plus les compteurs
        # de plusieurs équipements et du rollup « Total » dans un même max/min
        # (ça surestimait la consommation). Repli sur le rollup si la ligne ne
        # publie aucun compteur d'équipement.
        kwh_by_eq = {}
        for r in records:
            if r.unit == "kWh":
                kwh_by_eq.setdefault((r.equipment or "", r.area or ""), []).append(r.value)
        phys_deltas = [
            max(vals) - min(vals)
            for (eq, area), vals in kwh_by_eq.items()
            if not is_aggregate_rollup(area, eq)
        ]
        if phys_deltas:
            consumption_kwh = max(0.0, sum(phys_deltas))
        else:
            all_deltas = [max(vals) - min(vals) for vals in kwh_by_eq.values()]
            consumption_kwh = max(0.0, sum(all_deltas)) if all_deltas else 0.0

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

@router.get("/invoice")
def get_invoice(
    start: str | None = Query(default=None),   # ISO "2026-07-01" ou datetime
    end: str | None = Query(default=None),
    line: str | None = Query(default=None),    # optionnel : une ligne précise
    db: Session = Depends(get_db),
):
    """
    Facture énergétique sur une plage de dates : total + détail par énergie,
    par équipement, par zone et par ligne. Basé sur energy_history.cost
    (coût réel calculé à l'ingestion depuis les tarifs ONEE).
    """
    def parse(d, default):
        if not d:
            return default
        try:
            return datetime.fromisoformat(str(d).replace("Z", "").split(".")[0][:19]
                                          if "T" in str(d) else f"{d}T00:00:00")
        except Exception:
            return default

    now = datetime.utcnow()
    start_dt = parse(start, now - timedelta(days=30))
    end_dt = parse(end, now)
    if "T" not in str(end or ""):
        end_dt = end_dt + timedelta(days=1)  # inclure toute la journée de fin

    # Agrégation SQL : min/max du compteur PAR (équipement, énergie, zone, ligne)
    # sur la période. La consommation réelle = max - min (delta du compteur),
    # PAS la somme de chaque relevé (qui gonflait la facture à des milliards).
    q = (
        db.query(
            EnergyHistory.equipment.label("equipment"),
            EnergyHistory.energy_name.label("energy"),
            EnergyHistory.area.label("area"),
            EnergyHistory.production_line.label("line"),
            EnergyHistory.unit.label("unit"),
            func.min(EnergyHistory.value).label("vmin"),
            func.max(EnergyHistory.value).label("vmax"),
        )
        .filter(
            EnergyHistory.timestamp >= start_dt,
            EnergyHistory.timestamp < end_dt,
        )
    )
    if line:
        q = q.filter(EnergyHistory.production_line == line)
    q = q.group_by(
        EnergyHistory.equipment, EnergyHistory.energy_name,
        EnergyHistory.area, EnergyHistory.production_line, EnergyHistory.unit,
    )

    # Une ligne de facture par (équipement, énergie). On IGNORE :
    #  - les rollups d'agrégation (Total / zones) → double comptage,
    #  - les kW (puissance instantanée) → on ne facture que l'énergie (kWh /
    #    tonne / L / m³), jamais la puissance.
    items = []
    for g in q.all():
        if is_aggregate_rollup(g.area, g.equipment):
            continue
        if (g.unit or "").strip().lower() == "kw":
            continue
        consumption = max(0.0, float(g.vmax or 0) - float(g.vmin or 0))
        cost = calculate_cost(g.energy, consumption)   # consommation × tarif ONEE
        if cost <= 0:                                  # non facturable (voltage, CO₂…)
            continue
        items.append({
            "equipment": g.equipment or "—", "energy": g.energy or "—",
            "area": g.area or "—", "line": g.line or "—", "unit": g.unit,
            "consumption": consumption, "cost": round(cost, 2),
        })

    def group_by(field):
        acc = {}
        for it in items:
            k = it[field] or "—"
            a = acc.setdefault(k, {"cost": 0.0, "value": 0.0, "unit": it["unit"]})
            a["cost"]  += it["cost"]
            a["value"] += it["consumption"]
        return [
            {"name": k, "cost": round(v["cost"], 2),
             "quantity": round(v["value"], 2), "unit": v["unit"]}
            for k, v in sorted(acc.items(), key=lambda x: -x[1]["cost"])
        ]

    total = round(sum(it["cost"] for it in items), 2)

    return {
        "start": start_dt.isoformat(),
        "end": (end_dt - timedelta(days=1)).isoformat() if "T" not in str(end or "") else end_dt.isoformat(),
        "line": line or "All lines",
        "total_cost": total,
        "records": len(items),
        "by_energy": group_by("energy"),
        "by_equipment": group_by("equipment"),
        "by_zone": group_by("area"),
        "by_line": group_by("line"),
    }
