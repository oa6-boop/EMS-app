from datetime import datetime

from fastapi import APIRouter, Depends, Body
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import require_admin, get_current_user
from app.db import get_db
from app.models import AuditLog, User

router = APIRouter(prefix="/api/admin", tags=["audit"])


@router.get("/audit-logs")
def get_audit_logs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    logs = (
        db.query(AuditLog)
        .order_by(desc(AuditLog.timestamp))
        .limit(500)
        .all()
    )

    return [
        {
            "id": log.id,
            "action": log.action,
            "performed_by": log.performed_by,
            "target_user": log.target_user,
            "description": log.description,
            "timestamp": log.timestamp,
        }
        for log in logs
    ]


@router.post("/audit-logs")
def create_audit_log(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    action = payload.get("action", "ACTION")
    description = payload.get("description", "")

    user_name = f"{current.first_name} {current.last_name}".strip() or current.email

    db.add(AuditLog(
        action=action,
        performed_by=user_name,
        target_user=None,
        description=description,
        timestamp=datetime.utcnow(),
    ))
    db.commit()

    return {"message": "logged"}