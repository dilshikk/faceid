"""Incident lifecycle: confirmation threshold, dedup, state transitions.

Per TZ section 5: an incident is only confirmed after N consecutive failed
checks, deduplicated by (service, fingerprint), with a recovery notice sent
separately when the service returns to active.
"""
import datetime as dt
import hashlib

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import Incident, IncidentStatus, MonitoredService, ServiceStatus
from app.repositories.repositories import open_incident_for_fingerprint


def make_fingerprint(unit_name: str, status: ServiceStatus) -> str:
    raw = f"{unit_name}:{status.value}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


class IncidentOutcome:
    def __init__(self, incident: Incident | None, newly_confirmed: bool, recovered: Incident | None):
        self.incident = incident
        self.newly_confirmed = newly_confirmed
        self.recovered = recovered


def evaluate(
    db: Session,
    service: MonitoredService,
    status: ServiceStatus,
    consecutive_failures: int,
) -> IncidentOutcome:
    settings = get_settings()
    threshold = settings.monitor_failure_threshold

    if status in (ServiceStatus.failed, ServiceStatus.unknown):
        fingerprint = make_fingerprint(service.unit_name, status)
        existing = open_incident_for_fingerprint(db, service.id, fingerprint)

        if existing is not None:
            # Bump last_seen so repeat detections of the same open incident
            # are reflected (previously this assigned the field to itself,
            # a no-op that left last_seen frozen at its first value).
            existing.last_seen = dt.datetime.now(dt.timezone.utc)
            db.commit()
            return IncidentOutcome(existing, False, None)

        if consecutive_failures < threshold:
            return IncidentOutcome(None, False, None)

        incident = Incident(
            service_id=service.id,
            fingerprint=fingerprint,
            severity="critical" if status == ServiceStatus.failed else "warning",
            status=IncidentStatus.open,
        )
        db.add(incident)
        db.commit()
        return IncidentOutcome(incident, True, None)

    if status == ServiceStatus.active:
        open_incidents = (
            db.query(Incident)
            .filter(Incident.service_id == service.id, Incident.status != IncidentStatus.resolved)
            .all()
        )
        recovered = None
        for inc in open_incidents:
            inc.status = IncidentStatus.resolved
            inc.resolved_at = dt.datetime.now(dt.timezone.utc)
            recovered = inc
        if open_incidents:
            db.commit()
        return IncidentOutcome(None, False, recovered)

    return IncidentOutcome(None, False, None)
