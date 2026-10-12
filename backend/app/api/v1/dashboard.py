"""Dashboard summary endpoint (TZ 4.1 and 7)."""
from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db import get_db
from app.models.models import MonitoredService, ServiceStatusHistory, User
from app.repositories.repositories import latest_server_metric, list_incidents
from app.schemas.schemas import DashboardSummaryOut, IncidentOut, ServerMetricOut
from app.services.health_checks import check_postgres, check_telegram

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _count_services_by_latest_status(db: Session) -> dict[str, int]:
    """Count services by their *current* (most recent) status.

    Grouping the whole history table would count every past poll, so the
    numbers would grow with each check instead of reflecting services.
    """
    latest = (
        select(
            ServiceStatusHistory.service_id.label("service_id"),
            func.max(ServiceStatusHistory.observed_at).label("max_at"),
        )
        .group_by(ServiceStatusHistory.service_id)
        .subquery()
    )
    rows = (
        db.query(ServiceStatusHistory.status, func.count())
        .join(
            latest,
            and_(
                ServiceStatusHistory.service_id == latest.c.service_id,
                ServiceStatusHistory.observed_at == latest.c.max_at,
            ),
        )
        .join(MonitoredService, MonitoredService.id == ServiceStatusHistory.service_id)
        .group_by(ServiceStatusHistory.status)
        .all()
    )
    return {status.value: count for status, count in rows}


@router.get("/summary", response_model=DashboardSummaryOut)
async def summary(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    by_status = _count_services_by_latest_status(db)

    last_check = db.query(func.max(ServiceStatusHistory.observed_at)).scalar()
    recent, _next_cursor = list_incidents(db, limit=10)
    metric = latest_server_metric(db)

    return DashboardSummaryOut(
        services_by_status=by_status,
        last_check_at=last_check,
        recent_incidents=[
            IncidentOut(
                id=i.id,
                service_id=i.service_id,
                severity=i.severity,
                status=i.status.value,
                first_seen=i.first_seen,
                last_seen=i.last_seen,
                resolved_at=i.resolved_at,
            )
            for i in recent
        ],
        server=(
            ServerMetricOut(
                cpu_percent=metric.cpu_percent,
                ram_percent=metric.ram_percent,
                disk_percent=metric.disk_percent,
                uptime_seconds=metric.uptime_seconds,
                observed_at=metric.observed_at,
            )
            if metric
            else None
        ),
        # Live checks for the dashboard; the worker separately persists
        # these into health_checks on each poll cycle for history (TZ 6).
        postgres_healthy=check_postgres(db),
        telegram_healthy=await check_telegram(),
    )
