"""Dashboard summary endpoint (TZ 4.1 and 7)."""
import datetime as dt

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import get_current_user
from app.db import get_db
from app.models.models import Incident, MonitoredService, ServiceStatusHistory, User
from app.repositories.repositories import latest_server_metric, list_incidents
from app.schemas.schemas import DashboardSummaryOut, IncidentOut, ServerMetricOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def _telegram_healthy() -> bool:
    settings = get_settings()
    if not settings.telegram_bot_token:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"https://api.telegram.org/bot{settings.telegram_bot_token}/getMe")
            return resp.status_code == 200
    except httpx.HTTPError:
        return False


@router.get("/summary", response_model=DashboardSummaryOut)
async def summary(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (
        db.query(ServiceStatusHistory.status, func.count())
        .join(MonitoredService, MonitoredService.id == ServiceStatusHistory.service_id)
        .group_by(ServiceStatusHistory.status)
        .all()
    )
    by_status = {status.value: count for status, count in rows}

    last_check = db.query(func.max(ServiceStatusHistory.observed_at)).scalar()
    recent = list_incidents(db, limit=10)
    metric = latest_server_metric(db)

    postgres_healthy = True
    try:
        db.execute(func.now())
    except Exception:  # noqa: BLE001
        postgres_healthy = False

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
        postgres_healthy=postgres_healthy,
        telegram_healthy=await _telegram_healthy(),
    )
