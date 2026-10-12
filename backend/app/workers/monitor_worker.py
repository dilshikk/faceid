"""Background worker: polls allowlisted services, records history, raises
incidents, sends notifications, records dependency health checks, and runs
daily retention cleanup. Runs as its own systemd unit (bcc-worker.service)
so a crash here never touches monitored bots.
"""
import asyncio
import datetime as dt
import logging

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db import SessionLocal
from app.models.models import MonitoredService, ServerMetric, ServiceStatusHistory
from app.services.health_checks import check_postgres, check_telegram, record_health_check
from app.services.incident_manager import evaluate
from app.services.metrics_collector import collect_server_metrics
from app.services.notification_service import (
    format_incident_message,
    format_recovery_message,
    is_notification_allowed,
    notify_admins,
)
from app.services.retention import cleanup_old_data
from app.services.systemd_monitor import read_unit_status

logger = logging.getLogger("bcc.worker")

_consecutive_failures: dict[str, int] = {}
_last_cleanup: dt.datetime | None = None


async def poll_once(db) -> None:
    settings = get_settings()
    services = db.query(MonitoredService).filter(MonitoredService.enabled.is_(True)).all()

    for service in services:
        status = await read_unit_status(service.unit_name)
        db.add(
            ServiceStatusHistory(
                service_id=service.id,
                status=status.state,
                pid=status.pid,
            )
        )
        db.commit()

        if status.state.value in ("failed", "unknown"):
            _consecutive_failures[service.id] = _consecutive_failures.get(service.id, 0) + 1
        else:
            _consecutive_failures[service.id] = 0

        outcome = evaluate(db, service, status.state, _consecutive_failures[service.id])
        admin_ids = settings.telegram_admin_ids_list
        if outcome.newly_confirmed and outcome.incident and admin_ids:
            if is_notification_allowed(db, "incident_open"):
                text = format_incident_message(service, outcome.incident)
                await notify_admins(db, admin_ids, text, outcome.incident.id)
        if outcome.recovered and admin_ids:
            if is_notification_allowed(db, "incident_recovered"):
                text = format_recovery_message(service)
                await notify_admins(db, admin_ids, text, outcome.recovered.id)

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

    # Persist dependency health history (TZ 6: health_checks was previously
    # created in the schema but never written to).
    postgres_healthy = check_postgres(db)
    telegram_healthy = await check_telegram()
    record_health_check(db, "postgres", postgres_healthy)
    record_health_check(db, "telegram", telegram_healthy)
    db.commit()


async def maybe_run_cleanup(db) -> None:
    """Run retention cleanup at most once a day (TZ acceptance criterion
    #12). Previously there was no cleanup job at all."""
    global _last_cleanup
    now = dt.datetime.now(dt.timezone.utc)
    if _last_cleanup is not None and now - _last_cleanup < dt.timedelta(days=1):
        return
    deleted = cleanup_old_data(db)
    _last_cleanup = now
    logger.info("retention cleanup removed rows: %s", deleted)


async def run_forever() -> None:
    configure_logging()
    settings = get_settings()
    logger.info("Bot Control Center worker starting")
    while True:
        db = SessionLocal()
        try:
            await poll_once(db)
            await maybe_run_cleanup(db)
        except Exception:  # noqa: BLE001 - worker must never crash the loop
            logger.exception("poll_once failed")
        finally:
            db.close()
        await asyncio.sleep(settings.monitor_default_interval_seconds)


if __name__ == "__main__":
    asyncio.run(run_forever())
