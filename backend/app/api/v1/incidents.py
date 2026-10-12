"""Incident listing, single-incident detail, and acknowledgement
(TZ 4.1, 5, 7)."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.rate_limit import mutation_rate_limiter
from app.core.security import get_current_user, require_role
from app.db import get_db
from app.models.models import AuditLog, Incident, IncidentStatus, User
from app.repositories.repositories import list_incidents
from app.schemas.schemas import IncidentOut, PageOut

router = APIRouter(prefix="/incidents", tags=["incidents"])


def _to_out(incident: Incident) -> IncidentOut:
    return IncidentOut(
        id=incident.id,
        service_id=incident.service_id,
        severity=incident.severity,
        status=incident.status.value,
        first_seen=incident.first_seen,
        last_seen=incident.last_seen,
        resolved_at=incident.resolved_at,
    )


@router.get("", response_model=PageOut[IncidentOut])
def list_all(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=200),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows, next_cursor = list_incidents(db, status_filter, limit=limit, cursor=cursor)
    return PageOut(items=[_to_out(i) for i in rows], next_cursor=next_cursor)


@router.get("/{incident_id}", response_model=IncidentOut)
def get_one(
    incident_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return _to_out(incident)


@router.post(
    "/{incident_id}/acknowledge",
    response_model=IncidentOut,
    dependencies=[Depends(mutation_rate_limiter)],
)
def acknowledge(
    incident_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("owner", "admin")),
):
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")

    incident.status = IncidentStatus.acknowledged
    incident.acknowledged_by = user.id
    db.add(AuditLog(actor=user.username, action=f"acknowledge_incident:{incident_id}", result="success"))
    db.commit()

    return _to_out(incident)
