"""Background worker: polls allowlisted services, records history, raises
incidents, sends notifications, records dependency health checks, and runs
daily retention cleanup. Runs as its own systemd unit (bcc-worker.service)
so a crash here never touches monitored bots.

Scheduling: the loop wakes every TICK_SECONDS and checks only the services
whose own interval_seconds has elapsed. Server metrics and dependency
health checks run every MONITOR_DEFAULT_INTERVAL_SECONDS.
"""
import asyncio
import datetime as dt
import logging
import time

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db import SessionLocal
from app.models.models import IncidentStatus, MonitoredService, ServerMetric, ServiceStatusHistory
from app.services.health_checks import check_postgres, check_telegram, record_health_check
from app.services.incident_manager import FAILURE_STATES, evaluate
from app.services.metrics_collector import collect_server_metrics
from app.services.notification_service import (
    format_incident_message,
    format_recovery_message,
    format_reminder_message,
    is_notification_allowed,
    is_reminder_due,
    notify_admins,
)
from app.services.retention import cleanup_old_data
from app.services.systemd_monitor import read_unit_status

logger = logging.getLogger("bcc.worker")

# Lower bound for any per-service interval, so a misconfigured 0/1 second
# interval cannot turn the worker into a busy loop.
MIN_INTERVAL_SECONDS = 5
TICK_SECONDS = MIN_INTERVAL_SECONDS

_consecutive_failures: dict[str, int] = {}
_next_check_at: dict[str, float] = {}  # service_id -> time.monotonic() deadline
_next_system_check_at: float = 0.0
_last_cleanup: dt.datetime | None = None


def _service_interval(service: MonitoredService, default: int) -> int:
    return max(MIN_INTERVAL_SECONDS, service.interval_seconds or default)


async def check_service(db: Session, service: MonitoredService) -> None:
    settings = get_settings()
    status = await read_unit_status(service.unit_name)
    db.add(ServiceStatusHistory(service_id=service.id, status=status.state, pid=status.pid))
    db.commit()

    if status.state in FAILURE_STATES:
        _consecutive_failures[service.id] = _consecutive_failures.get(service.id, 0) + 1
    else:
        _consecutive_failures[service.id] = 0

    outcome = evaluate(db, service, status.state, _consecutive_failures[service.id])
    admin_ids = settings.telegram_admin_ids_list
    if not admin_ids:
        return

    incident = outcome.incident
    if outcome.newly_confirmed and incident is not None:
        if is_notification_allowed(db, "incident_open"):
            await notify_admins(db, admin_ids, format_incident_message(service, incident), incident.id)
    elif (
        incident is not None
        # Acknowledged incidents are being handled; do not nag.
        and incident.status == IncidentStatus.open
        and is_notification_allowed(db, "incident_open")
        and is_reminder_due(db, incident)
    ):
        await notify_admins(db, admin_ids, format_reminder_message(service, incident), incident.id)

    if outcome.recovered and is_notification_allowed(db, "incident_recovered"):
        await notify_admins(db, admin_ids, format_recovery_message(service), outcome.recovered.id)


async def poll_due_services(db: Session) -> None:
    settings = get_settings()
    now = time.monotonic()
    services = db.query(MonitoredService).filter(MonitoredService.enabled.is_(True)).all()

    for service in services:
        if now < _next_check_at.get(service.id, 0.0):
            continue
        _next_check_at[service.id] = now + _service_interval(service, settings.monitor_default_interval_seconds)
        try:
            await check_service(db, service)
        except Exception:  # noqa: BLE001 - one broken service must not stop the others
            db.rollback()
            logger.exception("check failed for %s", service.unit_name)


async def maybe_record_system_health(db: Session) -> None:
    global _next_system_check_at
    settings = get_settings()
    now = time.monotonic()
    if now < _next_system_check_at:
        return
    _next_system_check_at = now + max(MIN_INTERVAL_SECONDS, settings.monitor_default_interval_seconds)

    metrics = collect_server_metrics()
    db.add(
        ServerMetric(
            cpu_percent=metrics.cpu_percent,
            ram_percent=metrics.ram_percent,
            disk_percent=metrics.disk_percent,
            uptime_seconds=metrics.uptime_seconds,
            observed_at=dt.datetime.now(dt.timezone.utc),
        )
    )
    db.commit()

    # Persist dependency health history (TZ 6).
    record_health_check(db, "postgres", check_postgres(db))
    record_health_check(db, "telegram", await check_telegram())
    db.commit()


async def maybe_run_cleanup(db: Session) -> None:
    """Run retention cleanup at most once a day (TZ acceptance criterion #12)."""
    global _last_cleanup
    now = dt.datetime.now(dt.timezone.utc)
    if _last_cleanup is not None and now - _last_cleanup < dt.timedelta(days=1):
        return
    deleted = cleanup_old_data(db)
    _last_cleanup = now
    logger.info("retention cleanup removed rows: %s", deleted)


async def run_forever() -> None:
    configure_logging()
    logger.info("Bot Control Center worker starting")
    while True:
        db = SessionLocal()
        try:
            for step in (poll_due_services, maybe_record_system_health, maybe_run_cleanup):
                try:
                    await step(db)
                except Exception:  # noqa: BLE001 - worker must never crash the loop
                    db.rollback()
                    logger.exception("%s failed", step.__name__)
        finally:
            db.close()
        await asyncio.sleep(TICK_SECONDS)


if __name__ == "__main__":
    asyncio.run(run_forever())
