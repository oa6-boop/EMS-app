from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_active_user, require_admin, get_db
from app.core.security import get_password_hash
from app.models import AuditLog, User

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = ["admin", "management", "maintenance", "operator"]
MIN_PASSWORD_LENGTH = 6
ALLOWED_EMAIL_DOMAIN = "@jesagroup.com"


def is_valid_jesa_email(email: str) -> bool:
    """Email valide = partie locale non vide + domaine @jesagroup.com, sans espace."""
    if not email or " " in email:
        return False
    if not email.endswith(ALLOWED_EMAIL_DOMAIN):
        return False
    local_part = email[: -len(ALLOWED_EMAIL_DOMAIN)]
    return len(local_part) > 0


def user_to_dict(u: User) -> dict:
    return {
        "id":           u.id,
        "first_name":   u.first_name,
        "last_name":    u.last_name,
        "firstName":    u.first_name,
        "lastName":     u.last_name,
        "email":        u.email,
        "role":         u.role,
        "is_active":    u.is_active,
        "profile_image": u.profile_image or "",
        "profileImage": u.profile_image or "",
    }


@router.get("/me")
def get_me(
    current_user: User    = Depends(get_current_active_user),
):
    return user_to_dict(current_user)



@router.get("/technicians")
def list_technicians(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    technicians = (
        db.query(User)
        .filter(User.role == "maintenance", User.is_active == True)
        .order_by(User.first_name, User.last_name)
        .all()
    )
    return [
        {
            "id": t.id,
            "name": f"{t.first_name} {t.last_name}".strip(),
            "email": t.email,
        }
        for t in technicians
    ]



@router.patch("/me/profile")
def update_my_profile(
    payload:      dict,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user),
):
    first_name = (payload.get("firstName") or payload.get("first_name") or "").strip()
    last_name  = (payload.get("lastName")  or payload.get("last_name")  or "").strip()
    password   = (payload.get("password")  or "").strip()
    profile_image = payload.get("profileImage") or payload.get("profile_image") or ""

    if first_name:
        current_user.first_name = first_name
    if last_name:
        current_user.last_name = last_name
    if profile_image:
        current_user.profile_image = profile_image

    # ── Changer le mot de passe si fourni ────────────────────────────────────
    if password:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
            )
        current_user.hashed_password = get_password_hash(password)

    db.commit()
    db.refresh(current_user)

    return {
        "id":           current_user.id,
        "firstName":    current_user.first_name,
        "lastName":     current_user.last_name,
        "email":        current_user.email,
        "role":         current_user.role,
        "profileImage": current_user.profile_image or "",
        "message":      "Profile updated successfully",
    }


@router.get("")
def list_users(
    db:            Session = Depends(get_db),
    current_admin: User    = Depends(require_admin),
):
    return [user_to_dict(u) for u in db.query(User).order_by(User.id).all()]


@router.post("")
def create_user(
    user_data:     dict,
    db:            Session = Depends(get_db),
    current_admin: User    = Depends(require_admin),
):
    first_name = (user_data.get("first_name") or user_data.get("firstName") or "").strip()
    last_name  = (user_data.get("last_name")  or user_data.get("lastName")  or "").strip()
    email      = (user_data.get("email")      or "").strip().lower()
    password   = (user_data.get("password")   or "").strip()
    role       = (user_data.get("role")       or "management").strip()

    if not first_name or not last_name or not email or not password:
        raise HTTPException(status_code=400, detail="All fields are required")

    if not is_valid_jesa_email(email):
        raise HTTPException(status_code=400, detail="Only valid @jesagroup.com emails are allowed")

    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Valid: {VALID_ROLES}")

    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="This email already exists")

    user = User(
        first_name      = first_name,
        last_name       = last_name,
        email           = email,
        hashed_password = get_password_hash(password),
        role            = role,
        is_active       = True,
        profile_image   = "",
    )
    db.add(user)

    try:
        db.add(AuditLog(
            action       = "CREATE_USER",
            performed_by = current_admin.email,
            target_user  = email,
            description  = f"Created user {email} with role {role}",
        ))
    except Exception:
        pass

    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.patch("/{user_id}/role")
def update_user_role(
    user_id:       int,
    payload:       dict,
    db:            Session = Depends(get_db),
    current_admin: User    = Depends(require_admin),
):
    new_role = (payload.get("role") or "").strip()
    if new_role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Valid: {VALID_ROLES}")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot change admin role")

    old_role  = user.role
    user.role = new_role

    try:
        db.add(AuditLog(
            action       = "UPDATE_ROLE",
            performed_by = current_admin.email,
            target_user  = user.email,
            description  = f"Role changed from {old_role} to {new_role}",
        ))
    except Exception:
        pass

    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "old_role": old_role, "new_role": user.role}


@router.delete("/{user_id}")
def delete_user(
    user_id:       int,
    db:            Session = Depends(get_db),
    current_admin: User    = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete admin")

    try:
        db.add(AuditLog(
            action       = "DELETE_USER",
            performed_by = current_admin.email,
            target_user  = user.email,
            description  = f"Deleted user {user.email}",
        ))
    except Exception:
        pass

    # Nettoyage des donnees liees AVANT suppression, pour eviter une erreur
    # d'integrite (FK) : messages envoyes + conversations creees par ce user.
    # Import local pour ne pas alourdir le module.
    from app.models import Message, Conversation, ConversationParticipant

    db.query(Message).filter(Message.sender_id == user.id).delete(
        synchronize_session=False
    )
    db.query(ConversationParticipant).filter(
        ConversationParticipant.user_id == user.id
    ).delete(synchronize_session=False)

    created_convs = db.query(Conversation).filter(
        Conversation.created_by == user.id
    ).all()
    for conv in created_convs:
        db.query(Message).filter(Message.conversation_id == conv.id).delete(
            synchronize_session=False
        )
        db.query(ConversationParticipant).filter(
            ConversationParticipant.conversation_id == conv.id
        ).delete(synchronize_session=False)
        db.delete(conv)

    db.delete(user)
    db.commit()
    return {"status": "deleted", "id": user_id}