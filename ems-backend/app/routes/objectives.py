"""
objectives.py — CRUD energy objectives
GET    /api/objectives          → liste
POST   /api/objectives          → créer
PUT    /api/objectives/{id}     → modifier
DELETE /api/objectives/{id}     → supprimer
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import EnergyObjectiveRecord, User
from app.core.deps import get_current_active_user

router = APIRouter(prefix="/api/objectives", tags=["objectives"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def obj_to_dict(o: EnergyObjectiveRecord) -> dict:
    return {
        "id":               o.id,
        "type":             o.type,
        "title":            o.title or "",
        "target_value":     o.target_value,
        "current_baseline": o.current_baseline,
        "period":           o.period,
        "start_date":       o.start_date or "",
        "end_date":         o.end_date or "",
        "description":      o.description or "",
        "line":             o.line or "",
        "unit":             o.unit or "",
        "icon":             o.icon or "📊",
        "created_by":       o.created_by,
        "created_at":       o.created_at.isoformat() if o.created_at else None,
    }


@router.get("")
def list_objectives(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    objectives = db.query(EnergyObjectiveRecord)\
                   .order_by(EnergyObjectiveRecord.created_at.desc())\
                   .all()
    return [obj_to_dict(o) for o in objectives]


@router.post("")
def create_objective(
    payload:      dict,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    if not payload.get("type") or payload.get("target_value") is None:
        raise HTTPException(400, "type and target_value are required")

    obj = EnergyObjectiveRecord(
        type             = payload.get("type"),
        title            = payload.get("title", ""),
        target_value     = float(payload.get("target_value", 0)),
        current_baseline = float(payload.get("current_baseline", 0)),
        period           = payload.get("period", "Monthly"),
        start_date       = payload.get("start_date", ""),
        end_date         = payload.get("end_date", ""),
        description      = payload.get("description", ""),
        line             = payload.get("line", ""),
        unit             = payload.get("unit", ""),
        icon             = payload.get("icon", "📊"),
        created_by       = current_user.id,
        created_at       = datetime.utcnow(),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj_to_dict(obj)


@router.put("/{obj_id}")
def update_objective(
    obj_id:       int,
    payload:      dict,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    obj = db.query(EnergyObjectiveRecord).filter(EnergyObjectiveRecord.id == obj_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found")

    for field in ["type", "title", "target_value", "current_baseline",
                  "period", "start_date", "end_date", "description", "line", "unit", "icon"]:
        if field in payload:
            val = float(payload[field]) if field in ["target_value", "current_baseline"] else payload[field]
            setattr(obj, field, val)

    obj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(obj)
    return obj_to_dict(obj)


@router.delete("/{obj_id}")
def delete_objective(
    obj_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    obj = db.query(EnergyObjectiveRecord).filter(EnergyObjectiveRecord.id == obj_id).first()
    if not obj:
        raise HTTPException(404, "Objective not found")

    db.delete(obj)
    db.commit()
    return {"status": "deleted", "id": obj_id}