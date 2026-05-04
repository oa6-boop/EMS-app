from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.core.security import get_password_hash
from app.db import get_db
from app.models import (
    AuditLog,
    ConversationParticipant,
    Message,
    PasswordResetRequest,
    User,
)

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("")
def create_user(
    user_data: dict,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    first_name = (user_data.get("first_name") or "").strip()
    last_name = (user_data.get("last_name") or "").strip()
    email = (user_data.get("email") or "").strip().lower()
    password = (user_data.get("password") or "").strip()
    role = user_data.get("role") or "user"

    if not first_name or not last_name or not email or not password:
        raise HTTPException(status_code=400, detail="All fields are required")

    if not email.endswith("@jesagroup.com"):
        raise HTTPException(status_code=400, detail="Only @jesagroup.com emails are allowed")

    existing_user = db.query(User).filter(func.lower(User.email) == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="This email has already been created")

    user = User(
        first_name=first_name,
        last_name=last_name,
        email=email,
        hashed_password=get_password_hash(password),
        role=role,
        is_active=True,
        profile_image="",
        created_by=current_admin.email,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(
        AuditLog(
            action="CREATE_USER",
            performed_by=current_admin.email,
            target_user=user.email,
            description="Admin created a new user",
        )
    )
    db.commit()

    return {
        "id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "role": user.role,
        "profile_image": user.profile_image,
    }


@router.get("")
def get_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": user.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "role": user.role,
            "profile_image": user.profile_image,
        }
        for user in users
    ]


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.email.lower() == "admin@jesagroup.com":
        raise HTTPException(status_code=400, detail="Default admin cannot be deleted")

    target_email = user.email

    try:
        db.query(PasswordResetRequest).filter(
            PasswordResetRequest.user_id == user.id
        ).delete(synchronize_session=False)

        db.query(Message).filter(
            Message.sender_id == user.id
        ).delete(synchronize_session=False)

        db.query(ConversationParticipant).filter(
            ConversationParticipant.user_id == user.id
        ).delete(synchronize_session=False)

        db.delete(user)

        db.add(
            AuditLog(
                action="DELETE_USER",
                performed_by=current_admin.email,
                target_user=target_email,
                description="Admin deleted user",
            )
        )

        db.commit()

        return {"message": "User deleted successfully", "deletedUserId": user_id}

    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(exc)}")