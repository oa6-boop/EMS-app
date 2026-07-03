from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db import get_db
from app.core.deps import get_current_active_user
from app.models import Alarm, AuditLog, EnergyHistory, TelemetryRecord, User
from app.utils import build_industry_kpis

router = APIRouter(prefix="/api/industry", tags=["industry"],
                   dependencies=[Depends(get_current_active_user)])


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


# Roles autorises a resoudre une alarme. L'operateur est un OBSERVATEUR :
# il est volontairement exclu (read-only). Cette regle est appliquee cote
# serveur pour qu'elle ne soit pas contournable depuis le frontend.
ROLES_ALLOWED_TO_RESOLVE = {"admin", "management", "maintenance"}


@router.post("/alarms/{alarm_id}/resolve")
def resolve_alarm(
    alarm_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # 1) Verification du role (securite serveur, non contournable)
    user_role = (current_user.role or "").lower().strip()
    if user_role not in ROLES_ALLOWED_TO_RESOLVE:
        raise HTTPException(
            status_code=403,
            detail="Your role is read-only and cannot resolve alarms.",
        )

    # 2) L'alarme doit exister -> vrai 404 si absente
    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")

    # 3) Idempotence : si deja resolue, on ne refait rien
    if alarm.status == "resolved":
        return {"message": "Alarm already resolved", "id": alarm.id}

    alarm.status = "resolved"
    alarm.resolved_at = datetime.utcnow()

    # 4) Trace d'audit : qui a resolu quoi et quand
    db.add(AuditLog(
        action="RESOLVE_ALARM",
        performed_by=f"{current_user.first_name} {current_user.last_name}",
        target_user=None,
        description=(
            f"Alarme #{alarm.id} ({alarm.alarm_type}) resolue sur "
            f"{alarm.equipment} / {alarm.production_line}"
        ),
    ))

    db.commit()

    return {"message": "Alarm resolved successfully", "id": alarm.id}


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