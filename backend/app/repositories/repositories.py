"""Thin query layer. Every lookup is scoped to the BCC's own tables only."""
import datetime as dt

from sqlalchemy import and_, desc, or_
from sqlalchemy.orm import Session

from app.models.models import (
    Incident,
    LogEvent,
    MonitoredService,
    NotificationSetting,
    ServerMetric,
    ServiceStatusHistory,
)


def _encode_cursor(ts: dt.datetime, row_id: str) -> str:
    return f"{ts.isoformat()}::{row_id}"


def _decode_cursor(cursor: str) -> tuple[dt.datetime, str]:
    ts_raw, _, row_id = cursor.partition("::")
    return dt.datetime.fromisoformat(ts_raw), row_id


def list_services(
    db: Session, limit: int = 100, cursor: str | None = None
) -> tuple[list[MonitoredService], str | None]:
    """Cursor-paginated, newest first (TZ 7: bounded response size)."""
    query = db.query(MonitoredService).order_by(
        desc(MonitoredService.created_at), desc(MonitoredService.id)
    )
    if cursor:
        cursor_time, cursor_id = _decode_cursor(cursor)
        query = query.filter(
            or_(
                MonitoredService.created_at < cursor_time,
                and_(MonitoredService.created_at == cursor_time, MonitoredService.id < cursor_id),
            )
        )
    rows = query.limit(limit).all()
    next_cursor = _encode_cursor(rows[-1].created_at, rows[-1].id) if len(rows) == limit else None
    return rows, next_cursor


def get_service(db: Session, service_id: str) -> MonitoredService | None:
    return db.get(MonitoredService, service_id)


def create_service(db: Session, name: str, unit_name: str, interval_seconds: int) -> MonitoredService:
    service = MonitoredService(name=name, unit_name=unit_name, interval_seconds=interval_seconds)
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


def update_service(
    db: Session,
    service: MonitoredService,
    *,
    name: str | None = None,
    enabled: bool | None = None,
    interval_seconds: int | None = None,
) -> MonitoredService:
    if name is not None:
        service.name = name
    if enabled is not None:
        service.enabled = enabled
    if interval_seconds is not None:
        service.interval_seconds = interval_seconds
    db.commit()
    return service


def latest_status(db: Session, service_id: str) -> ServiceStatusHistory | None:
    return (
        db.query(ServiceStatusHistory)
        .filter(ServiceStatusHistory.service_id == service_id)
        .order_by(desc(ServiceStatusHistory.observed_at))
        .first()
    )


def service_history(db: Session, service_id: str, limit: int = 100) -> list[ServiceStatusHistory]:
    return (
        db.query(ServiceStatusHistory)
        .filter(ServiceStatusHistory.service_id == service_id)
        .order_by(desc(ServiceStatusHistory.observed_at))
        .limit(limit)
        .all()
    )


def list_incidents(
    db: Session, status: str | None = None, limit: int = 100, cursor: str | None = None
) -> tuple[list[Incident], str | None]:
    """Cursor-paginated, newest first (TZ 7: bounded response size)."""
    query = db.query(Incident)
    if status:
        query = query.filter(Incident.status == status)
    query = query.order_by(desc(Incident.last_seen), desc(Incident.id))
    if cursor:
        cursor_time, cursor_id = _decode_cursor(cursor)
        query = query.filter(
            or_(
                Incident.last_seen < cursor_time,
                and_(Incident.last_seen == cursor_time, Incident.id < cursor_id),
            )
        )
    rows = query.limit(limit).all()
    next_cursor = _encode_cursor(rows[-1].last_seen, rows[-1].id) if len(rows) == limit else None
    return rows, next_cursor


def open_incident_for_fingerprint(db: Session, service_id: str, fingerprint: str) -> Incident | None:
    return (
        db.query(Incident)
        .filter(
            Incident.service_id == service_id,
            Incident.fingerprint == fingerprint,
            Incident.status != "resolved",
        )
        .one_or_none()
    )


def latest_server_metric(db: Session) -> ServerMetric | None:
    return db.query(ServerMetric).order_by(desc(ServerMetric.observed_at)).first()


def recent_log_events(db: Session, service_id: str, limit: int = 100) -> list[LogEvent]:
    return (
        db.query(LogEvent)
        .filter(LogEvent.service_id == service_id)
        .order_by(desc(LogEvent.event_time))
        .limit(limit)
        .all()
    )


def silence_event_type(db: Session, event_type: str, minutes: int) -> NotificationSetting:
    """Create or update the telegram NotificationSetting row for this event
    type so notify logic actually suppresses sends (TZ 5/8 "silence").

    `minutes <= 0` clears any existing silence.
    """
    setting = (
        db.query(NotificationSetting)
        .filter(NotificationSetting.channel == "telegram", NotificationSetting.event_type == event_type)
        .one_or_none()
    )
    if setting is None:
        setting = NotificationSetting(channel="telegram", event_type=event_type, recipient="telegram_admins")
        db.add(setting)

    setting.enabled = True
    setting.silence_until = (
        dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=minutes) if minutes > 0 else None
    )
    db.commit()
    db.refresh(setting)
    return setting
