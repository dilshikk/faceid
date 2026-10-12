"""Pydantic request/response schemas. No secrets are ever included here."""
import datetime as dt
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PageOut(BaseModel, Generic[T]):
    """Cursor-paginated response wrapper (TZ 7: bounded response size)."""

    items: list[T]
    next_cursor: str | None = None


class LoginRequest(BaseModel):
    username: str = Field(max_length=60)
    password: str = Field(max_length=256)
    # 6-digit TOTP code; required for accounts with 2FA enabled.
    otp: str | None = Field(default=None, max_length=10)


class ServiceOut(BaseModel):
    id: str
    name: str
    unit_name: str
    enabled: bool
    interval_seconds: int
    status: str
    pid: int | None = None
    last_transition_at: dt.datetime | None = None
    started_at: dt.datetime | None = None
    uptime_seconds: int | None = None
    restarts: int | None = None


class ServiceCreate(BaseModel):
    name: str
    unit_name: str
    interval_seconds: int = 15


class ServiceUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    interval_seconds: int | None = None


class ServiceHistoryOut(BaseModel):
    status: str
    pid: int | None = None
    observed_at: dt.datetime


class LogEventOut(BaseModel):
    level: str
    message: str
    event_time: dt.datetime


class IncidentOut(BaseModel):
    id: str
    service_id: str
    severity: str
    status: str
    first_seen: dt.datetime
    last_seen: dt.datetime
    resolved_at: dt.datetime | None = None


class ServerMetricOut(BaseModel):
    cpu_percent: float
    ram_percent: float
    disk_percent: float
    uptime_seconds: int
    observed_at: dt.datetime


class DashboardSummaryOut(BaseModel):
    services_by_status: dict[str, int]
    last_check_at: dt.datetime | None
    recent_incidents: list[IncidentOut]
    server: ServerMetricOut | None
    postgres_healthy: bool
    telegram_healthy: bool


class NotificationSettingOut(BaseModel):
    id: str
    channel: str
    event_type: str
    recipient: str
    cooldown_seconds: int
    enabled: bool
    silence_until: dt.datetime | None = None


class NotificationSettingUpdate(BaseModel):
    cooldown_seconds: int | None = None
    enabled: bool | None = None
    silence_minutes: int | None = None


class BotDatabaseIn(BaseModel):
    host: str = Field(default="127.0.0.1", min_length=1, max_length=255)
    port: int = Field(default=5432, ge=1, le=65535)
    dbname: str = Field(min_length=1, max_length=120)
    user: str = Field(min_length=1, max_length=120)
    # Omit/empty to keep the previously saved password.
    password: str | None = Field(default=None, max_length=256)
    users_table: str | None = Field(default=None, max_length=200)


class BotDatabaseOut(BaseModel):
    """Connection settings without the password (only has_password)."""

    configured: bool
    host: str | None = None
    port: int | None = None
    dbname: str | None = None
    user: str | None = None
    has_password: bool = False
    users_table: str | None = None


class BotTablesOut(BaseModel):
    tables: list[str]


class BotUsersOut(BaseModel):
    table: str
    columns: list[str]
    rows: list[list[str | int | float | bool | None]]
    total: int
    limit: int
    offset: int


class ErrorResponse(BaseModel):
    request_id: str
    message: str
