from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, distinct, func
from sqlalchemy.orm import Session

from app.core.deps import get_current_active_user
from app.db import get_db
from app.models import TelemetryRecord
from app.schemas import TelemetryOut
from app.utils import build_dashboard_summary, calculate_cost, calculate_co2, CO2_FACTOR_KG_PER_KWH, is_aggregate_rollup

# Toutes les routes de ce routeur exigent une authentification.
# (le /api/health public reste defini dans main.py)
router = APIRouter(prefix="/api", tags=["telemetry"],
                   dependencies=[Depends(get_current_active_user)])


def apply_context_filters(q, plant=None, zone=None, equipment=None, tag=None):
    """Filtres Plant / Zone / Équipement / Tag — pour que TOUTES les pages
    (graphes compris) réagissent aux filtres du header."""
    if plant:
        q = q.filter(TelemetryRecord.plant.ilike(plant))
    if zone:
        q = q.filter(TelemetryRecord.area.ilike(zone))
    if equipment:
        q = q.filter(TelemetryRecord.equipment.ilike(equipment))
    if tag:
        q = q.filter(TelemetryRecord.tags.ilike(f"%{str(tag).strip().lower()}%"))
    return q


@router.get("/telemetry", response_model=list[TelemetryOut])
def get_telemetry(limit: int = Query(default=100, ge=1, le=1000), db: Session = Depends(get_db)):
    return db.query(TelemetryRecord).order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()


@router.get("/telemetry/latest")
def get_latest_summary(db: Session = Depends(get_db)):
    # FIX FUITE MÉMOIRE : cette route est appelée toutes les 5 s par le
    # frontend. Charger TOUTE la table (des centaines de milliers de lignes
    # qui grossissent en continu) consommait plusieurs Go de RAM et
    # ralentissait toute l'application. On ne charge que la fenêtre récente :
    # la DataPlatform publie toutes les 2-10 s, 15 minutes suffisent largement.
    cutoff = datetime.utcnow() - timedelta(minutes=15)
    records = (
        db.query(TelemetryRecord)
        .filter(TelemetryRecord.timestamp >= cutoff)
        .order_by(desc(TelemetryRecord.timestamp))
        .limit(5000)
        .all()
    )
    if not records:
        # Plateforme à l'arrêt : on retombe sur les derniers relevés connus.
        records = (
            db.query(TelemetryRecord)
            .order_by(desc(TelemetryRecord.timestamp))
            .limit(2000)
            .all()
        )
    return build_dashboard_summary(records)


@router.get("/telemetry/structure")
def get_structure(db: Session = Depends(get_db)):
    """Découverte automatique: lignes, équipements, types d'énergie présents dans la DB."""
    # PERF : fenêtre 24 h (indexée) au lieu de scanner toute la table 6 fois —
    # cette route est appelée en continu par le frontend.
    cutoff = datetime.utcnow() - timedelta(hours=24)

    def recent(column):
        return db.query(distinct(column)).filter(TelemetryRecord.timestamp >= cutoff)

    lines       = [r[0] for r in recent(TelemetryRecord.production_line).all() if r[0]]
    energy_types= [r[0] for r in recent(TelemetryRecord.energy_name).all()      if r[0]]
    plants      = [r[0] for r in recent(TelemetryRecord.plant).all()             if r[0]]
    raw_tags    = [r[0] for r in recent(TelemetryRecord.tags).all()              if r[0]]
    tags = sorted({t.strip() for row in raw_tags for t in str(row).split(",") if t.strip()})

    # Zones + équipements dérivés des paires (zone, équipement) en EXCLUANT les
    # rollups d'agrégation → 12 équipements / 5 zones cohérents avec les cartes.
    pair_rows = (
        db.query(TelemetryRecord.area, TelemetryRecord.equipment)
        .filter(TelemetryRecord.timestamp >= cutoff)
        .distinct().all()
    )
    real_pairs = [(a, e) for (a, e) in pair_rows if a and e and not is_aggregate_rollup(a, e)]
    areas     = sorted({a for (a, _) in real_pairs})
    equipment = sorted({e for (_, e) in real_pairs})

    return {
        "lines": sorted(lines), "equipment": equipment,
        "energy_types": sorted(energy_types), "areas": areas,
        "plants": sorted(plants), "tags": tags, "has_data": len(lines) > 0,
    }


@router.get("/telemetry/equipment-list")
def get_equipment_list(db: Session = Depends(get_db)):
    """Liste dynamique des équipements découverts depuis la DataPlatform."""
    cutoff = datetime.utcnow() - timedelta(hours=24)
    rows = (
        db.query(
            TelemetryRecord.plant,
            TelemetryRecord.production_line,
            TelemetryRecord.area,
            TelemetryRecord.equipment,
            TelemetryRecord.tags,
            func.max(TelemetryRecord.timestamp).label("last_seen"),
        )
        .filter(TelemetryRecord.timestamp >= cutoff)
        .group_by(
            TelemetryRecord.plant,
            TelemetryRecord.production_line,
            TelemetryRecord.area,
            TelemetryRecord.equipment,
            TelemetryRecord.tags,
        )
        .order_by(TelemetryRecord.equipment.asc())
        .all()
    )

    return [
        {
            "plant": r.plant,
            "production_line": r.production_line,
            "area": r.area,
            "equipment": r.equipment,
            "tags": r.tags or "",
            "last_seen": r.last_seen.isoformat() if r.last_seen else None,
        }
        for r in rows
        if not is_aggregate_rollup(r.area, r.equipment)   # exclut les rollups zone/ligne
    ]


@router.get("/telemetry/line/{line_name}")
def get_line_history(line_name: str, limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)):
    records = (
        db.query(TelemetryRecord)
        .filter(TelemetryRecord.production_line == line_name)
        .order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()
    )
    return [{
        "id": r.id, "production_line": r.production_line, "area": r.area,
        "equipment": r.equipment, "energy_name": r.energy_name,
        "value": r.value, "unit": r.unit, "source": r.source,
        "timestamp": r.timestamp.isoformat(),
        "cost": calculate_cost(r.energy_name, r.value),
        "co2_kg": calculate_co2(r.energy_name, r.value, r.unit),
        "voltage": r.voltage, "power_factor": r.power_factor,
        "frequency": r.frequency, "thd": r.thd,
        "plant": r.plant, "unit_name": r.unit_name,
    } for r in records]


@router.get("/telemetry/power-quality/{line_name}")
def get_power_quality_history(
    line_name: str,
    limit: int = Query(default=48, ge=1, le=200),
    plant: str | None = Query(default=None),
    zone: str | None = Query(default=None),
    equipment: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = (
        db.query(TelemetryRecord)
        .filter(TelemetryRecord.production_line == line_name, TelemetryRecord.voltage.isnot(None))
    )
    q = apply_context_filters(q, plant=plant, zone=zone, equipment=equipment, tag=tag)
    records = q.order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()
    return [{"timestamp": r.timestamp.isoformat(), "voltage": r.voltage,
             "power_factor": r.power_factor,
             "frequency": r.frequency if r.frequency is not None else 50.0,
             "thd": r.thd if r.thd is not None else 0.0,
             "kw": r.value if r.unit == "kW" else None,
             "equipment": r.equipment}
            for r in reversed(records)]


@router.get("/telemetry/carbon/{line_name}")
def get_carbon_history(
    line_name: str,
    limit: int = Query(default=48, ge=1, le=200),
    plant: str | None = Query(default=None),
    zone: str | None = Query(default=None),
    equipment: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Retourne l'historique CO2 pour une ligne.
    Priorité: mesures CO2 directes depuis DataPlatform (energy_name CO2-Emissions)
    Fallback: calcul depuis kWh × 0.718
    Respecte les filtres Plant / Zone / Équipement / Tag du header.
    """
    # D'abord chercher les mesures CO2 directes
    q = (
        db.query(TelemetryRecord)
        .filter(
            TelemetryRecord.production_line == line_name,
            TelemetryRecord.energy_name.ilike("%co2%"),
        )
    )
    q = apply_context_filters(q, plant=plant, zone=zone, equipment=equipment, tag=tag)
    co2_records = q.order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()
    # Si pas de mesures CO2 directes, calculer depuis kWh
    if not co2_records:
        q = (
            db.query(TelemetryRecord)
            .filter(TelemetryRecord.production_line == line_name, TelemetryRecord.unit == "kWh")
        )
        q = apply_context_filters(q, plant=plant, zone=zone, equipment=equipment, tag=tag)
        co2_records = q.order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()
        return [{
            "timestamp": r.timestamp.isoformat(),
            "co2_kg": round(r.value * CO2_FACTOR_KG_PER_KWH, 3),
            "kwh": r.value, "equipment": r.equipment, "area": r.area, "unit_name": r.unit_name,
            "source": "calculated",
        } for r in reversed(co2_records)]
    else:
        return [{
            "timestamp": r.timestamp.isoformat(),
            "co2_kg": round(r.value, 3),
            "kwh": None, "equipment": r.equipment, "area": r.area, "unit_name": r.unit_name,
            "source": "direct",
        } for r in reversed(co2_records)]


@router.get("/telemetry/energy/{energy_name}")
def get_energy_data(energy_name: str, limit: int = Query(default=200, ge=1, le=500), db: Session = Depends(get_db)):
    records = (
        db.query(TelemetryRecord)
        .filter(TelemetryRecord.energy_name == energy_name)
        .order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()
    )
    return [{"id": r.id, "production_line": r.production_line, "equipment": r.equipment,
             "energy_name": r.energy_name, "value": r.value, "unit": r.unit,
             "source": r.source, "timestamp": r.timestamp.isoformat(),
             "cost": calculate_cost(r.energy_name, r.value)}
            for r in records]