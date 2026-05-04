import os
import shutil
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_active_user
from app.db import get_db
from app.models import (
    AuditLog,
    Conversation,
    ConversationParticipant,
    Message,
    User,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_user_full_name(user: User) -> str:
    return f"{user.first_name} {user.last_name}".strip()


def ensure_participant(db: Session, conversation_id: int, user_id: int):
    participant = db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == conversation_id,
        ConversationParticipant.user_id == user_id,
    ).first()

    if not participant:
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("/search-users")
def search_users(
    q: str = Query(default=""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = db.query(User).filter(User.is_active == True, User.id != current_user.id)

    if q.strip():
        q_lower = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(User.email).like(q_lower)
            | func.lower(User.first_name).like(q_lower)
            | func.lower(User.last_name).like(q_lower)
        )

    users = query.order_by(User.first_name.asc()).limit(50).all()

    return [
        {
            "id": user.id,
            "firstName": user.first_name,
            "lastName": user.last_name,
            "email": user.email,
            "role": user.role,
            "profileImage": user.profile_image,
        }
        for user in users
    ]


@router.post("/conversations/private")
def create_or_get_private_conversation(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    other_user_id = payload.get("user_id")
    other_user = db.query(User).filter(User.id == other_user_id, User.is_active == True).first()

    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")

    my_participants = db.query(ConversationParticipant).filter(
        ConversationParticipant.user_id == current_user.id
    ).all()

    for row in my_participants:
        conv = db.query(Conversation).filter(
            Conversation.id == row.conversation_id,
            Conversation.type == "private",
        ).first()

        if not conv:
            continue

        conv_participants = db.query(ConversationParticipant).filter(
            ConversationParticipant.conversation_id == conv.id
        ).all()

        ids = sorted([p.user_id for p in conv_participants])
        if ids == sorted([current_user.id, other_user.id]):
            return {"conversation_id": conv.id, "message": "Conversation already exists"}

    conversation = Conversation(
        type="private",
        name=None,
        created_by=current_user.id,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    db.add(ConversationParticipant(conversation_id=conversation.id, user_id=current_user.id))
    db.add(ConversationParticipant(conversation_id=conversation.id, user_id=other_user.id))

    db.add(
        AuditLog(
            action="CREATE_PRIVATE_CONVERSATION",
            performed_by=current_user.email,
            target_user=other_user.email,
            description="User started a private conversation",
        )
    )

    db.commit()

    return {"conversation_id": conversation.id, "message": "Conversation created successfully"}


@router.post("/conversations/group")
def create_group_conversation(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    group_name = (payload.get("name") or "").strip()
    user_ids = payload.get("user_ids") or []

    if not group_name:
        raise HTTPException(status_code=400, detail="Group name is required")

    if not user_ids:
        raise HTTPException(status_code=400, detail="Please select at least one user")

    conversation = Conversation(
        type="group",
        name=group_name,
        created_by=current_user.id,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    all_user_ids = set(user_ids + [current_user.id])

    for user_id in all_user_ids:
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
        if user:
            db.add(ConversationParticipant(conversation_id=conversation.id, user_id=user.id))

    db.add(
        AuditLog(
            action="CREATE_GROUP",
            performed_by=current_user.email,
            target_user=group_name,
            description="User created a group conversation",
        )
    )

    db.commit()

    return {"conversation_id": conversation.id, "message": "Group created successfully"}


@router.get("/conversations")
def get_my_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    participant_rows = db.query(ConversationParticipant).filter(
        ConversationParticipant.user_id == current_user.id
    ).all()

    conversation_ids = [row.conversation_id for row in participant_rows]
    if not conversation_ids:
        return []

    conversations = db.query(Conversation).filter(Conversation.id.in_(conversation_ids)).all()

    result = []
    for conversation in conversations:
        participants = db.query(ConversationParticipant).filter(
            ConversationParticipant.conversation_id == conversation.id
        ).all()

        participant_users = []
        for participant in participants:
            user = db.query(User).filter(User.id == participant.user_id).first()
            if user:
                participant_users.append(
                    {
                        "id": user.id,
                        "firstName": user.first_name,
                        "lastName": user.last_name,
                        "email": user.email,
                    }
                )

        last_message = db.query(Message).filter(
            Message.conversation_id == conversation.id
        ).order_by(Message.created_at.desc()).first()

        result.append(
            {
                "id": conversation.id,
                "type": conversation.type,
                "name": conversation.name,
                "created_by": conversation.created_by,
                "created_at": conversation.created_at,
                "participants": participant_users,
                "lastMessage": last_message.content if last_message else "",
                "lastMessageAt": last_message.created_at.isoformat() if last_message else None,
            }
        )

    result.sort(
        key=lambda item: item["lastMessageAt"] or item["created_at"].isoformat(),
        reverse=True,
    )
    return result


@router.get("/conversations/{conversation_id}/messages")
def get_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ensure_participant(db, conversation_id, current_user.id)

    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.asc()).all()

    result = []
    for message in messages:
        sender = db.query(User).filter(User.id == message.sender_id).first()
        sender_name = get_user_full_name(sender) if sender else "Unknown"

        result.append(
            {
                "id": message.id,
                "conversation_id": message.conversation_id,
                "sender_id": message.sender_id,
                "content": message.content,
                "message_type": message.message_type,
                "file_name": message.file_name,
                "file_url": message.file_url,
                "created_at": message.created_at,
                "sender_name": sender_name,
            }
        )

    return result


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ensure_participant(db, conversation_id, current_user.id)

    content = (payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content is required")

    message = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=content,
        message_type="text",
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return {"message": "Message sent successfully", "message_id": message.id}


@router.post("/conversations/{conversation_id}/upload")
def upload_file_to_chat(
    conversation_id: int,
    uploaded_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ensure_participant(db, conversation_id, current_user.id)

    original_name = uploaded_file.filename or "file"
    extension = os.path.splitext(original_name)[1]
    unique_name = f"{uuid4().hex}{extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(uploaded_file.file, buffer)

    public_url = f"http://127.0.0.1:8000/uploads/{unique_name}"

    message = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=f"Shared file: {original_name}",
        message_type="file",
        file_name=original_name,
        file_url=public_url,
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return JSONResponse(
        {
            "message": "File uploaded successfully",
            "message_id": message.id,
            "file_name": original_name,
            "file_url": public_url,
        }
    )


@router.put("/messages/{message_id}")
def update_message(
    message_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")

    if message.message_type != "text":
        raise HTTPException(status_code=400, detail="Only text messages can be edited")

    new_content = (payload.get("content") or "").strip()
    if not new_content:
        raise HTTPException(status_code=400, detail="Message content is required")

    message.content = new_content
    db.commit()

    return {"message": "Message updated successfully"}


@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    message = db.query(Message).filter(Message.id == message_id).first()

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    conversation = db.query(Conversation).filter(Conversation.id == message.conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if message.sender_id != current_user.id and conversation.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot delete this message")

    if message.file_url and "uploads/" in message.file_url:
        try:
            file_name = message.file_url.split("/uploads/")[-1]
            local_path = os.path.join(UPLOAD_DIR, file_name)
            if os.path.exists(local_path):
                os.remove(local_path)
        except Exception:
            pass

    db.delete(message)
    db.commit()

    return {"message": "Message deleted successfully"}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    ensure_participant(db, conversation_id, current_user.id)

    if conversation.type == "group" and conversation.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the group creator can delete this group")

    db.delete(conversation)
    db.commit()

    return {"message": "Conversation deleted successfully"}


@router.post("/share-report")
def share_report(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    conversation_id = payload.get("conversation_id")
    file_name = payload.get("file_name")
    file_url = payload.get("file_url")

    ensure_participant(db, conversation_id, current_user.id)

    message = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content="Shared a report",
        message_type="report",
        file_name=file_name,
        file_url=file_url,
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return {"message": "Report shared successfully", "message_id": message.id}