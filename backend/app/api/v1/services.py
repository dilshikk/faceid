"""Service listing, detail, registration, history and logs (TZ 4.2, 7)."""
import datetime as dt
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.rate_limit import mutation_rate_limiter
from app.core.security import get_current_user, require_role
from app.db import get_db
from app.models.models import AuditLog, MonitoredService, ServiceStatus, User
from app.repositories.repositories import (
    create_service,
    get_service,
    latest_status,
    list_services,
    service_history,
    update_service,
)
from app.schemas.schemas import (
    LogEventOut,
    PageOut,
    ServiceCreate,
    ServiceHistoryOut,
    ServiceOut,
    ServiceUpdate,
)
from app.services.journal_reader import detect_level, read_unit_logs
from app.services.systemd_monitor import is_valid_unit_name

router = APIRouter(prefix="/services", tags=["services"])

# Matches journalctl `-o short-iso` lines, e.g.
# "2026-10-12T10:00:00+0000 host unit[123]: message text".
_JOURNAL_LINE_RE = re.compile(r"^(?P<ts>\S+)\s+\S+\s+(?P<msg>.*)$")


def _parse_iso(raw: object) -> dt.datetime | None:
    if not isinstance(raw, str):
        return None
    try:
        return dt.datetime.fromisoformat(raw)
    except ValueError:
        return None


def _to_service_out(service: MonitoredService, latest) -> ServiceOut:
    details = (latest.details_json or {}) if latest else {}
    started_at = _parse_iso(details.get("started_at"))
    uptime = None
    if started_at is not None and latest is not None and latest.status == ServiceStatus.active:
        uptime = max(0, int((dt.datetime.now(dt.timezone.utc) - started_at).total_seconds()))
    restarts = details.get("restarts")
    return ServiceOut(
        id=service.id,
        name=service.name,
        unit_name=service.unit_name,
        enabled=service.enabled,
        interval_seconds=service.interval_seconds,
        status=latest.status.value if latest else "unknown",
        pid=latest.pid if latest else None,
        last_transition_at=latest.observed_at if latest else None,
        started_at=started_at,
        uptime_seconds=uptime,
        restarts=restarts if isinstance(restarts, int) else None,
    )


def _parse_journal_line(line: str, fallback: dt.datetime) -> LogEventOut:
    match = _JOURNAL_LINE_RE.match(line)
    if not match:
        return LogEventOut(level=detect_level(line), message=line, event_time=fallback)
    message = match.group("msg")
    try:
        event_time = dt.datetime.fromisoformat(match.group("ts"))
    except ValueError:
        event_time = fallback
    return LogEventOut(level=detect_level(message), message=message, event_time=event_time)


@router.get("", response_model=PageOut[ServiceOut])
def list_all(
    limit: int = Query(default=50, le=200),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows, next_cursor = list_services(db, limit=limit, cursor=cursor)
    items = [_to_service_out(service, latest_status(db, service.id)) for service in rows]
    return PageOut(items=items, next_cursor=next_cursor)


@router.post(
    "",
    response_model=ServiceOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(mutation_rate_limiter)],
)
def create(
    payload: ServiceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("owner", "admin")),
):
    if not is_valid_unit_name(payload.unit_name):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "unit_name must end with .service and contain no spaces or slashes",
        )
    existing = db.query(MonitoredService).filter(MonitoredService.unit_name == payload.unit_name).one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Service already registered")

    service = create_service(db, payload.name, payload.unit_name, payload.interval_seconds)
    db.add(AuditLog(actor=user.username, action=f"create_service:{service.unit_name}", result="success"))
    db.commit()
    return _to_service_out(service, None)


@router.get("/{service_id}", response_model=ServiceOut)
def get_one(service_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    service = get_service(db, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return _to_service_out(service, latest_status(db, service.id))


@router.patch(
    "/{service_id}",
    response_model=ServiceOut,
    dependencies=[Depends(mutation_rate_limiter)],
)
def update(
    service_id: str,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("owner", "admin")),
):
    service = get_service(db, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")

    update_service(
        db,
        service,
        name=payload.name,
        enabled=payload.enabled,
        interval_seconds=payload.interval_seconds,
    )
    db.add(AuditLog(actor=user.username, action=f"update_service:{service.unit_name}", result="success"))
    db.commit()
    return _to_service_out(service, latest_status(db, service.id))


@router.get("/{service_id}/history", response_model=list[ServiceHistoryOut])
def history(
    service_id: str,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    service = get_service(db, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return [
        ServiceHistoryOut(status=h.status.value, pid=h.pid, observed_at=h.observed_at)
        for h in service_history(db, service_id, limit)
    ]


@router.get("/{service_id}/logs", response_model=list[LogEventOut])
async def logs(
    service_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    since: dt.datetime | None = Query(
        default=None, description="Only return log lines observed at or after this UTC timestamp"
    ),
    q: str | None = Query(default=None, max_length=200, description="Case-insensitive substring filter"),
    level: Literal["error", "warning", "info"] | None = Query(
        default=None, description="Only return lines of this level (TZ 4.2)"
    ),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    service = get_service(db, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")

    since_arg = None
    if since is not None:
        since_utc = since if since.tzinfo else since.replace(tzinfo=dt.timezone.utc)
        since_arg = since_utc.astimezone(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    lines = await read_unit_logs(service.unit_name, limit, since=since_arg)
    now = dt.datetime.now(dt.timezone.utc)
    events = [_parse_journal_line(line, now) for line in lines]

    if level:
        events = [e for e in events if e.level == level]
    if q:
        needle = q.lower()
        events = [e for e in events if needle in e.message.lower()]

    return events
