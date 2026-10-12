"""Deletes rows older than RETENTION_DAYS from high-volume tables, per TZ
acceptance criterion #12 ("backup and cleanup of old data").

Runs once a day from the worker loop (see workers/monitor_worker.py), in
bounded batches so a single run never holds a long-lived lock. incidents
and monitored_services are intentionally never cleaned up here: they are
low-volume and meaningful indefinitely.
"""
import datetime as dt

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import HealthCheck, LogEvent, NotificationDelivery, ServiceStatusHistory

BATCH_SIZE = 1000


def _delete_older_than(db: Session, model: type, time_column, cutoff: dt.datetime) -> int:
    deleted = 0
    while True:
        rows = db.query(model).filter(time_column < cutoff).limit(BATCH_SIZE).all()
        if not rows:
            break
        for row in rows:
            db.delete(row)
        db.commit()
        deleted += len(rows)
        if len(rows) < BATCH_SIZE:
            break
    return deleted


def cleanup_old_data(db: Session) -> dict[str, int]:
    settings = get_settings()
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=settings.retention_days)
    return {
        "service_status_history": _delete_older_than(
            db, ServiceStatusHistory, ServiceStatusHistory.observed_at, cutoff
        ),
        "log_events": _delete_older_than(db, LogEvent, LogEvent.event_time, cutoff),
        "notification_deliveries": _delete_older_than(
            db, NotificationDelivery, NotificationDelivery.sent_at, cutoff
        ),
        "health_checks": _delete_older_than(db, HealthCheck, HealthCheck.checked_at, cutoff),
    }
