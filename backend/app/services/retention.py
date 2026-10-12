"""Deletes old rows from high-volume tables, per TZ acceptance criterion #12
("backup and cleanup of old data").

Runs once a day from the worker loop (see workers/monitor_worker.py), in
bounded batches so a single run never holds a long-lived lock. incidents
and monitored_services are intentionally never cleaned up here: they are
low-volume and meaningful indefinitely.
"""
import datetime as dt

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import (
    HealthCheck,
    LogEvent,
    NotificationDelivery,
    ServerMetric,
    ServiceStatusHistory,
    UserSession,
)

BATCH_SIZE = 1000


def _delete_older_than(db: Session, model: type, time_column, cutoff: dt.datetime) -> int:
    """Delete rows with time_column < cutoff in batches of BATCH_SIZE.

    Uses a bulk DELETE by primary key per batch instead of loading and
    deleting ORM objects one by one (server_metrics alone grows by ~5760
    rows a day).
    """
    deleted = 0
    while True:
        ids = [row_id for (row_id,) in db.query(model.id).filter(time_column < cutoff).limit(BATCH_SIZE).all()]
        if not ids:
            break
        db.query(model).filter(model.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        deleted += len(ids)
        if len(ids) < BATCH_SIZE:
            break
    return deleted


def cleanup_old_data(db: Session) -> dict[str, int]:
    settings = get_settings()
    now = dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(days=settings.retention_days)
    return {
        "service_status_history": _delete_older_than(
            db, ServiceStatusHistory, ServiceStatusHistory.observed_at, cutoff
        ),
        "log_events": _delete_older_than(db, LogEvent, LogEvent.event_time, cutoff),
        "notification_deliveries": _delete_older_than(
            db, NotificationDelivery, NotificationDelivery.sent_at, cutoff
        ),
        "health_checks": _delete_older_than(db, HealthCheck, HealthCheck.checked_at, cutoff),
        # Previously never cleaned: written on every poll cycle.
        "server_metrics": _delete_older_than(db, ServerMetric, ServerMetric.observed_at, cutoff),
        # Expired sessions are useless; remove them as soon as they expire.
        "user_sessions": _delete_older_than(db, UserSession, UserSession.expires_at, now),
    }
