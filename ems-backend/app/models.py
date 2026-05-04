from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from app.db import Base

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db import Base


class TelemetryRecord(Base):
    __tablename__ = "telemetry_records"

    id = Column(Integer, primary_key=True, index=True)
    plant = Column(String, default="Plant 1", nullable=False, index=True)
    unit_name = Column(String, default="Unit 1", nullable=False, index=True)
    production_line = Column(String, index=True, nullable=False)
    area = Column(String, default="Area 1", nullable=False, index=True)
    equipment = Column(String, default="Equipment 1", nullable=False, index=True)

    energy_name = Column(String, index=True, nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    source = Column(String, default="mqtt", nullable=False)

    voltage = Column(Float, nullable=True)
    frequency = Column(Float, nullable=True)
    power_factor = Column(Float, nullable=True)
    thd = Column(Float, nullable=True)

    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class EnergyHistory(Base):
    __tablename__ = "energy_history"

    id = Column(Integer, primary_key=True, index=True)
    plant = Column(String, nullable=False, index=True)
    unit_name = Column(String, nullable=False, index=True)
    production_line = Column(String, nullable=False, index=True)
    area = Column(String, nullable=False, index=True)
    equipment = Column(String, nullable=False, index=True)

    energy_name = Column(String, nullable=False, index=True)
    value = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    cost = Column(Float, default=0.0, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class Alarm(Base):
    __tablename__ = "alarms"

    id = Column(Integer, primary_key=True, index=True)
    plant = Column(String, nullable=False, index=True)
    unit_name = Column(String, nullable=False, index=True)
    production_line = Column(String, nullable=False, index=True)
    area = Column(String, nullable=False, index=True)
    equipment = Column(String, nullable=False, index=True)

    energy_name = Column(String, nullable=True, index=True)
    alarm_type = Column(String, nullable=False, index=True)
    severity = Column(String, default="medium", nullable=False)
    message = Column(Text, nullable=False)
    measured_value = Column(Float, nullable=True)
    limit_value = Column(Float, nullable=True)
    status = Column(String, default="active", nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    resolved_at = Column(DateTime, nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    profile_image = Column(String, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    last_login = Column(DateTime, nullable=True)
    created_by = Column(String, nullable=True)

    reset_requests = relationship(
        "PasswordResetRequest",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    sent_messages = relationship("Message", back_populates="sender")


class PasswordResetRequest(Base):
    __tablename__ = "password_reset_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    email = Column(String, index=True, nullable=False)
    status = Column(String, default="pending", nullable=False)
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    generated_password = Column(String, default="", nullable=False)

    user = relationship("User", back_populates="reset_requests")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False)
    performed_by = Column(String, nullable=False)
    target_user = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)
    name = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    participants = relationship(
        "ConversationParticipant",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    conversation = relationship("Conversation", back_populates="participants")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=True)
    message_type = Column(String, default="text", nullable=False)
    file_name = Column(String, nullable=True)
    file_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", back_populates="sent_messages")


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id             = Column(Integer, primary_key=True, index=True)
    equipment      = Column(String,  nullable=False)
    type           = Column(String,  nullable=False)
    scheduled_date = Column(String,  nullable=False)
    technician     = Column(String,  nullable=True)
    notes          = Column(Text,    nullable=True)
    status         = Column(String,  default="Planned")
    completed_date = Column(String,  nullable=True)
    priority       = Column(String,  default="Normal")
    created_by     = Column(Integer, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EnergyObjectiveRecord(Base):
    __tablename__ = "energy_objectives"

    id                = Column(Integer, primary_key=True, index=True)
    type              = Column(String,  nullable=False)
    title             = Column(String,  nullable=True)
    target_value      = Column(Float,   nullable=False)
    current_baseline  = Column(Float,   nullable=False)
    period            = Column(String,  default="Monthly")
    start_date        = Column(String,  nullable=True)
    end_date          = Column(String,  nullable=True)
    description       = Column(Text,    nullable=True)
    line              = Column(String,  nullable=True)
    unit              = Column(String,  nullable=True)
    icon              = Column(String,  nullable=True)
    created_by        = Column(Integer, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
    updated_at        = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)