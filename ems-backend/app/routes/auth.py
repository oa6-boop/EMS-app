from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_active_user
from app.core.security import create_access_token, verify_password
from app.db import get_db
from app.models import AuditLog, User

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/token")
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    email = form_data.username.strip().lower()

    user = db.query(User).filter(func.lower(User.email) == email).first()

    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    user.last_login = datetime.utcnow()

    log = AuditLog(
        action="LOGIN",
        performed_by=user.email,
        target_user=user.email,
        description="User logged in",
    )
    db.add(log)
    db.commit()

    access_token = create_access_token(
        data={"sub": user.email.lower(), "role": user.role}
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/users/me")
def read_users_me(current_user: User = Depends(get_current_active_user)):
    return {
        "id": current_user.id,
        "firstName": current_user.first_name,
        "lastName": current_user.last_name,
        "email": current_user.email,
        "role": current_user.role,
        "profileImage": current_user.profile_image or "",
    }