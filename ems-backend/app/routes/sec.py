"""
sec.py — Specific Energy Consumption partagé entre tous les utilisateurs
GET  /api/sec/{line_name}  → lire la valeur SEC d'une ligne
POST /api/sec/{line_name}  → sauvegarder la valeur SEC
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime

from app.db import SessionLocal, Base
from app.core.deps import get_current_active_user
from app.models import User

router = APIRouter(prefix="/api/sec", tags=["sec"])


# ─── Table SEC ────────────────────────────────────────────────────────────────
class SECRecord(Base):
    __tablename__ = "sec_records"
    id            = Column(Integer, primary_key=True, index=True)
    line_name     = Column(String,  unique=True, index=True)
    production    = Column(Float,   default=0)
    unit          = Column(String,  default="tonne")
    updated_by    = Column(Integer, nullable=True)
    updated_at    = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/{line_name}")
def get_sec(
    line_name:    str,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    record = db.query(SECRecord).filter(SECRecord.line_name == line_name).first()
    if not record:
        return {"line_name": line_name, "production": 0, "unit": "tonne"}
    return {
        "line_name":  record.line_name,
        "production": record.production,
        "unit":       record.unit,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


@router.post("/{line_name}")
def save_sec(
    line_name:    str,
    payload:      dict,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    record = db.query(SECRecord).filter(SECRecord.line_name == line_name).first()
    if record:
        record.production = float(payload.get("production", 0))
        record.unit       = payload.get("unit", "tonne")
        record.updated_by = current_user.id
        record.updated_at = datetime.utcnow()
    else:
        record = SECRecord(
            line_name  = line_name,
            production = float(payload.get("production", 0)),
            unit       = payload.get("unit", "tonne"),
            updated_by = current_user.id,
            updated_at = datetime.utcnow(),
        )
        db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "line_name":  record.line_name,
        "production": record.production,
        "unit":       record.unit,
    }