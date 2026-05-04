from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Alarm, EnergyHistory, TelemetryRecord
from app.utils import build_industry_kpis

router = APIRouter(prefix="/api/industry", tags=["industry"])


@router.get("/kpis")
def get_industry_kpis(db: Session = Depends(get_db)):
    records = db.query(TelemetryRecord).order_by(desc(TelemetryRecord.timestamp)).limit(500).all()
    alarms = db.query(Alarm).order_by(desc(Alarm.created_at)).limit(500).all()
    return build_industry_kpis(records, alarms)


@router.get("/alarms")
def get_alarms(db: Session = Depends(get_db)):
    alarms = db.query(Alarm).order_by(desc(Alarm.created_at)).limit(500).all()

    return [
        {
            "id": alarm.id,
            "plant": alarm.plant,
            "unit_name": alarm.unit_name,
            "production_line": alarm.production_line,
            "area": alarm.area,
            "equipment": alarm.equipment,
            "energy_name": alarm.energy_name,
            "alarm_type": alarm.alarm_type,
            "severity": alarm.severity,
            "message": alarm.message,
            "measured_value": alarm.measured_value,
            "limit_value": alarm.limit_value,
            "status": alarm.status,
            "created_at": alarm.created_at.isoformat(),
            "resolved_at": alarm.resolved_at.isoformat() if alarm.resolved_at else None,
        }
        for alarm in alarms
    ]


@router.post("/alarms/{alarm_id}/resolve")
def resolve_alarm(alarm_id: int, db: Session = Depends(get_db)):
    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        return {"message": "Alarm not found"}

    alarm.status = "resolved"
    alarm.resolved_at = datetime.utcnow()
    db.commit()

    return {"message": "Alarm resolved successfully"}


@router.get("/history")
def get_energy_history(db: Session = Depends(get_db)):
    history = db.query(EnergyHistory).order_by(desc(EnergyHistory.timestamp)).limit(1000).all()

    return [
        {
            "id": item.id,
            "plant": item.plant,
            "unit_name": item.unit_name,
            "production_line": item.production_line,
            "area": item.area,
            "equipment": item.equipment,
            "energy_name": item.energy_name,
            "value": item.value,
            "unit": item.unit,
            "cost": item.cost,
            "timestamp": item.timestamp.isoformat(),
        }
        for item in history
    ]