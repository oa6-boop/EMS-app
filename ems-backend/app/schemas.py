from datetime import datetime
from pydantic import BaseModel, EmailStr


class TelemetryOut(BaseModel):
    id: int
    production_line: str
    energy_name: str
    value: float
    unit: str
    source: str
    timestamp: datetime

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    role: str = "user"


class UserOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    role: str
    is_active: bool
    profile_image: str
    created_at: datetime
    last_login: datetime | None = None
    created_by: str | None = None

    class Config:
        from_attributes = True


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class PasswordResetRequestOut(BaseModel):
    id: int
    user_id: int
    email: EmailStr
    status: str
    requested_at: datetime
    resolved_at: datetime | None = None
    generated_password: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class UserPublic(BaseModel):
    id: int
    firstName: str
    lastName: str
    email: str
    role: str
    profileImage: str


class AuditLogOut(BaseModel):
    id: int
    action: str
    performed_by: str
    target_user: str | None = None
    description: str | None = None
    timestamp: datetime

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    user_id: int


class GroupCreate(BaseModel):
    name: str
    user_ids: list[int]


class ConversationOut(BaseModel):
    id: int
    type: str
    name: str | None = None
    created_by: int
    created_at: datetime
    participants: list[dict]

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    content: str


class ShareReportCreate(BaseModel):
    conversation_id: int
    file_name: str
    file_url: str


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    content: str | None = None
    message_type: str
    file_name: str | None = None
    file_url: str | None = None
    created_at: datetime
    sender_name: str

    class Config:
        from_attributes = True