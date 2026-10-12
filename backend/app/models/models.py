"""SQLAlchemy models for the bot_control_center database (TZ section 6).

All tables live in a dedicated database. BCC never reads or writes tables
belonging to the monitored bots.
"""
import datetime as dt
import enum
import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class ServiceStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    failed = "failed"
    activating = "activating"
    unknown = "unknown"


class IncidentStatus(str, enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"


class UserRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    viewer = "viewer"


class MonitoredService(Base):
    __tablename__ = "monitored_services"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    unit_name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    type: Mapped[str] = mapped_column(String(40), default="systemd")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    interval_seconds: Mapped[int] = mapped_column(Integer, default=15)
    config_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    status_history: Mapped[list["ServiceStatusHistory"]] = relationship(
        back_populates="service", cascade="all, delete-orphan"
    )
    incidents: Mapped[list["Incident"]] = relationship(
        back_populates="service", cascade="all, delete-orphan"
    )


class ServiceStatusHistory(Base):
    __tablename__ = "service_status_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    service_id: Mapped[str] = mapped_column(ForeignKey("monitored_services.id"))
    status: Mapped[ServiceStatus] = mapped_column(Enum(ServiceStatus))
    pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    observed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    details_json: Mapped[dict] = mapped_column(JSON, default=dict)

    service: Mapped[MonitoredService] = relationship(back_populates="status_history")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    service_id: Mapped[str] = mapped_column(ForeignKey("monitored_services.id"))
    fingerprint: Mapped[str] = mapped_column(String(120), index=True)
    severity: Mapped[str] = mapped_column(String(20), default="error")
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus), default=IncidentStatus.open
    )
    first_seen: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    resolved_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    service: Mapped[MonitoredService] = relationship(back_populates="incidents")


class LogEvent(Base):
    __tablename__ = "log_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    service_id: Mapped[str] = mapped_column(ForeignKey("monitored_services.id"))
    source: Mapped[str] = mapped_column(String(40), default="journald")
    level: Mapped[str] = mapped_column(String(20), default="error")
    message: Mapped[str] = mapped_column(Text)
    event_time: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    fingerprint: Mapped[str] = mapped_column(String(120), index=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    username: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.viewer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class TelegramAdmin(Base):
    __tablename__ = "telegram_admins"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    telegram_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    label: Mapped[str | None] = mapped_column(String(60), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class NotificationSetting(Base):
    __tablename__ = "notification_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    channel: Mapped[str] = mapped_column(String(20), default="telegram")
    event_type: Mapped[str] = mapped_column(String(40))
    recipient: Mapped[str] = mapped_column(String(120))
    cooldown_seconds: Mapped[int] = mapped_column(Integer, default=900)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # When set and in the future, notifications for this event_type are
    # suppressed (TZ 5/8 "silence"). Set via PATCH .../settings/{id} or the
    # Telegram /silence command.
    silence_until: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    sent_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class ServerMetric(Base):
    __tablename__ = "server_metrics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    cpu_percent: Mapped[float] = mapped_column()
    ram_percent: Mapped[float] = mapped_column()
    disk_percent: Mapped[float] = mapped_column()
    uptime_seconds: Mapped[int] = mapped_column(Integer)
    observed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class HealthCheck(Base):
    __tablename__ = "health_checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    dependency: Mapped[str] = mapped_column(String(40))
    is_healthy: Mapped[bool] = mapped_column(Boolean)
    checked_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    actor: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(120))
    result: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
