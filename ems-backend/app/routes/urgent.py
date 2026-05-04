from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.core.security import get_password_hash
from app.db import get_db
from app.models import AuditLog, PasswordResetRequest, User
from app.schemas import ForgotPasswordRequest, PasswordResetRequestOut
from app.utils import generate_temp_password

router = APIRouter(prefix="/api", tags=["urgent"])


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()

    user = db.query(User).filter(
        func.lower(User.email) == email,
        User.is_active == True
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    pending_request = db.query(PasswordResetRequest).filter(
        func.lower(PasswordResetRequest.email) == email,
        PasswordResetRequest.status == "pending",
    ).first()

    if pending_request:
        raise HTTPException(status_code=400, detail="A pending request already exists for this user")

    request_item = PasswordResetRequest(
        user_id=user.id,
        email=user.email.lower(),
        status="pending",
        generated_password="",
    )

    db.add(request_item)
    db.commit()
    db.refresh(request_item)

    return {"message": "Urgent reset request sent to admin successfully"}


@router.get("/admin/urgent-messages", response_model=list[PasswordResetRequestOut])
def get_urgent_messages(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(PasswordResetRequest).order_by(
        PasswordResetRequest.status.asc(),
        PasswordResetRequest.requested_at.desc(),
    ).all()


@router.get("/admin/urgent-messages/count")
def get_urgent_messages_count(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    count = db.query(PasswordResetRequest).filter(
        PasswordResetRequest.status == "pending"
    ).count()

    return {"pendingCount": count}


@router.post("/admin/urgent-messages/{request_id}/regenerate")
def regenerate_user_password(
    request_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    reset_request = db.query(PasswordResetRequest).filter(
        PasswordResetRequest.id == request_id
    ).first()

    if not reset_request:
        raise HTTPException(status_code=404, detail="Reset request not found")

    if reset_request.status == "resolved":
        raise HTTPException(status_code=400, detail="This request is already resolved")

    user = db.query(User).filter(User.id == reset_request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_password = generate_temp_password(10)

    user.hashed_password = get_password_hash(new_password)
    reset_request.status = "resolved"
    reset_request.generated_password = new_password
    reset_request.resolved_at = datetime.utcnow()

    log = AuditLog(
        action="RESET_PASSWORD",
        performed_by=current_admin.email,
        target_user=user.email,
        description="Admin regenerated password",
    )
    db.add(log)

    db.commit()
    db.refresh(reset_request)

    return {
        "message": "New password generated successfully",
        "email": user.email,
        "newPassword": new_password,
        "requestId": reset_request.id,
    }