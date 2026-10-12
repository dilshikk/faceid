"""Service listing, detail, history and logs (TZ 4.2, 7)."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db import get_db
from app.models.models import User
from app.repositories.repositories import (
    get_service,
    latest_status,
    list_services,
    recent_log_events,
    service_history,
)
from app.schemas.schemas import LogEventOut, ServiceHistoryOut, ServiceOut
from app.services.journal_reader import read_unit_logs

router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=list[ServiceOut])
def list_all(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    out = []
    for service in list_services(db):
        latest = latest_status(db, service.id)
        out.append(
            ServiceOut(
                id=service.id,
                name=service.name,
                unit_name=service.unit_name,
                enabled=service.enabled,
                interval_seconds=service.interval_seconds,
                status=latest.status.value if latest else "unknown",
                pid=latest.pid if latest else None,
                last_transition_at=latest.observed_at if latest else None,
            )
        )
    return out


@router.get("/{service_id}", response_model=ServiceOut)
def get_one(service_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    service = get_service(db, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    latest = latest_status(db, service.id)
    return ServiceOut(
        id=service.id,
        name=service.name,
        unit_name=service.unit_name,
        enabled=service.enabled,
        interval_seconds=service.interval_seconds,
        status=latest.status.value if latest else "unknown",
        pid=latest.pid if latest else None,
        last_transition_at=latest.observed_at if latest else None,
    )


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
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    service = get_service(db, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")

    # Live tail from journald (read-only, allowlisted unit) rather than only
    # the curated log_events table, per TZ 4.3.
    lines = await read_unit_logs(service.unit_name, limit)
    return [LogEventOut(level="info", message=line, event_time=h.observed_at) for line, h in zip(lines, recent_log_events(db, service_id, len(lines)) or [None] * len(lines)) if h] or [
        LogEventOut(level="info", message=line, event_time=service.created_at) for line in lines
    ]
