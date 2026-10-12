"""Pydantic request/response schemas. No secrets are ever included here."""
import datetime as dt
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

# Limits mirror the database column sizes so oversized input is rejected with
# a 422 instead of crashing on insert with a 500.
NAME_MAX = 120
USERNAME_MAX = 60
MIN_INTERVAL_SECONDS = 5
MAX_INTERVAL_SECONDS = 3600


class PageOut(BaseModel, Generic[T]):
    """Cursor-paginated response wrapper (TZ 7: bounded response size)."""

    items: list[T]
    next_cursor: str | None = None


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=USERNAME_MAX)
    # Upper bound keeps a huge password from being fed to Argon2.
    password: str = Field(min_length=1, max_length=256)


class ServiceOut(BaseModel):
    id: str
    name: str
    unit_name: str
    enabled: bool
    interval_seconds: int
    status: str
    pid: int | None = None
    last_transition_at: dt.datetime | None = None


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=NAME_MAX)
    unit_name: str = Field(min_length=1, max_length=NAME_MAX)
    interval_seconds: int = Field(default=15, ge=MIN_INTERVAL_SECONDS, le=MAX_INTERVAL_SECONDS)


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=NAME_MAX)
    enabled: bool | None = None
    interval_seconds: int | None = Field(
        default=None, ge=MIN_INTERVAL_SECONDS, le=MAX_INTERVAL_SECONDS
    )


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
    cooldown_seconds: int | None = Field(default=None, ge=0, le=7 * 24 * 3600)
    enabled: bool | None = None
    # Minutes from now to silence this event type; 0 clears an existing
    # silence. Capped at one year so timedelta/datetime arithmetic cannot
    # overflow and turn into a 500.
    silence_minutes: int | None = Field(default=None, ge=0, le=525600)


class ErrorResponse(BaseModel):
    request_id: str
    message: str
