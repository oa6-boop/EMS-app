from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import require_admin
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