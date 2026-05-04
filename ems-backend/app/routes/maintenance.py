"""
maintenance.py — CRUD maintenance records
GET    /api/maintenance          → liste
POST   /api/maintenance          → créer
PUT    /api/maintenance/{id}     → modifier
DELETE /api/maintenance/{id}     → supprimer
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import MaintenanceRecord, User
from app.core.deps import get_current_active_user

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def record_to_dict(r: MaintenanceRecord) -> dict:
    return {
        "id":             r.id,
        "equipment":      r.equipment,
        "type":           r.type,
        "scheduled_date": r.scheduled_date,
        "technician":     r.technician or "",
        "notes":          r.notes or "",
        "status":         r.status,
        "completed_date": r.completed_date or "",
        "priority":       r.priority,
        "created_by":     r.created_by,
        "created_at":     r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
def list_records(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    records = db.query(MaintenanceRecord)\
                .order_by(MaintenanceRecord.created_at.desc())\
                .all()
    return [record_to_dict(r) for r in records]


@router.post("")
def create_record(
    payload:      dict,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    if not payload.get("equipment") or not payload.get("scheduled_date"):
        raise HTTPException(400, "equipment and scheduled_date are required")

    record = MaintenanceRecord(
        equipment      = payload.get("equipment"),
        type           = payload.get("type", "Inspection visuelle"),
        scheduled_date = payload.get("scheduled_date"),
        technician     = payload.get("technician", ""),
        notes          = payload.get("notes", ""),
        status         = payload.get("status", "Planned"),
        completed_date = payload.get("completed_date", ""),
        priority       = payload.get("priority", "Normal"),
        created_by     = current_user.id,
        created_at     = datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record_to_dict(record)


@router.put("/{record_id}")
def update_record(
    record_id:    int,
    payload:      dict,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(404, "Record not found")

    for field in ["equipment", "type", "scheduled_date", "technician",
                  "notes", "status", "completed_date", "priority"]:
        if field in payload:
            setattr(record, field, payload[field])

    record.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(record)
    return record_to_dict(record)


@router.delete("/{record_id}")
def delete_record(
    record_id:    int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(404, "Record not found")

    db.delete(record)
    db.commit()
    return {"status": "deleted", "id": record_id}