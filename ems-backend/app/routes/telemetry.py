from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, distinct
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import TelemetryRecord
from app.schemas import TelemetryOut
from app.utils import build_dashboard_summary, calculate_cost, calculate_co2, CO2_FACTOR_KG_PER_KWH

router = APIRouter(prefix="/api", tags=["telemetry"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/telemetry", response_model=list[TelemetryOut])
def get_telemetry(limit: int = Query(default=100, ge=1, le=1000), db: Session = Depends(get_db)):
    return db.query(TelemetryRecord).order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()


@router.get("/telemetry/latest")
def get_latest_summary(db: Session = Depends(get_db)):
    records = db.query(TelemetryRecord).all()
    return build_dashboard_summary(records)


@router.get("/telemetry/structure")
def get_structure(db: Session = Depends(get_db)):
    """Découverte automatique: lignes, équipements, types d'énergie présents dans la DB."""
    lines       = [r[0] for r in db.query(distinct(TelemetryRecord.production_line)).all() if r[0]]
    equipment   = [r[0] for r in db.query(distinct(TelemetryRecord.equipment)).all()        if r[0]]
    energy_types= [r[0] for r in db.query(distinct(TelemetryRecord.energy_name)).all()      if r[0]]
    areas       = [r[0] for r in db.query(distinct(TelemetryRecord.area)).all()              if r[0]]
    plants      = [r[0] for r in db.query(distinct(TelemetryRecord.plant)).all()             if r[0]]
    return {
        "lines": sorted(lines), "equipment": sorted(equipment),
        "energy_types": sorted(energy_types), "areas": sorted(areas),
        "plants": sorted(plants), "has_data": len(lines) > 0,
    }


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
def get_power_quality_history(line_name: str, limit: int = Query(default=48, ge=1, le=200), db: Session = Depends(get_db)):
    records = (
        db.query(TelemetryRecord)
        .filter(TelemetryRecord.production_line == line_name, TelemetryRecord.voltage.isnot(None))
        .order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()
    )
    return [{"timestamp": r.timestamp.isoformat(), "voltage": r.voltage,
             "power_factor": r.power_factor,
             "frequency": r.frequency if r.frequency is not None else 50.0,
             "thd": r.thd if r.thd is not None else 0.0,
             "kw": r.value if r.unit == "kW" else None,
             "equipment": r.equipment}
            for r in reversed(records)]


@router.get("/telemetry/carbon/{line_name}")
def get_carbon_history(line_name: str, limit: int = Query(default=48, ge=1, le=200), db: Session = Depends(get_db)):
    """
    Retourne l'historique CO2 pour une ligne.
    Priorité: mesures CO2 directes depuis DataPlatform (energy_name CO2-Emissions)
    Fallback: calcul depuis kWh × 0.718
    """
    # D'abord chercher les mesures CO2 directes
    co2_records = (
        db.query(TelemetryRecord)
        .filter(
            TelemetryRecord.production_line == line_name,
            TelemetryRecord.energy_name.ilike("%co2%"),
        )
        .order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()
    )
    # Si pas de mesures CO2 directes, calculer depuis kWh
    if not co2_records:
        co2_records = (
            db.query(TelemetryRecord)
            .filter(TelemetryRecord.production_line == line_name, TelemetryRecord.unit == "kWh")
            .order_by(desc(TelemetryRecord.timestamp)).limit(limit).all()
        )
        return [{
            "timestamp": r.timestamp.isoformat(),
            "co2_kg": round(r.value * CO2_FACTOR_KG_PER_KWH, 3),
            "kwh": r.value, "equipment": r.equipment, "unit_name": r.unit_name,
            "source": "calculated",
        } for r in reversed(co2_records)]
    else:
        return [{
            "timestamp": r.timestamp.isoformat(),
            "co2_kg": round(r.value, 3),
            "kwh": None, "equipment": r.equipment, "unit_name": r.unit_name,
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