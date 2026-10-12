"""Incident lifecycle: confirmation threshold, dedup, state transitions.

Per TZ section 5: an incident is only confirmed after N consecutive failed
checks, deduplicated per service, with a recovery notice sent separately
when the service returns to active.
"""
import datetime as dt
import hashlib

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import Incident, IncidentStatus, MonitoredService, ServiceStatus
from app.repositories.repositories import open_incident_for_service

FAILURE_STATES = (ServiceStatus.failed, ServiceStatus.unknown)
# Any of these closes an open incident. inactive = the service was stopped
# on purpose; previously only active closed incidents, so a failed service
# that was then stopped kept its incident open forever.
CLOSING_STATES = (ServiceStatus.active, ServiceStatus.inactive)


def make_fingerprint(unit_name: str) -> str:
    """One fingerprint per unit. The status used to be part of it, so a
    service flapping between failed and unknown opened duplicate incidents."""
    return hashlib.sha256(f"{unit_name}:down".encode()).hexdigest()[:24]


def _severity(status: ServiceStatus) -> str:
    return "critical" if status == ServiceStatus.failed else "warning"


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
    now = dt.datetime.now(dt.timezone.utc)

    if status in FAILURE_STATES:
        # Look up by service (not fingerprint) so incidents opened with the
        # old status-based fingerprints are still found after upgrading.
        existing = open_incident_for_service(db, service.id)
        if existing is not None:
            existing.last_seen = now
            if _severity(status) == "critical":
                existing.severity = "critical"
            db.commit()
            return IncidentOutcome(existing, False, None)

        if consecutive_failures < threshold:
            return IncidentOutcome(None, False, None)

        incident = Incident(
            service_id=service.id,
            fingerprint=make_fingerprint(service.unit_name),
            severity=_severity(status),
            status=IncidentStatus.open,
        )
        db.add(incident)
        db.commit()
        return IncidentOutcome(incident, True, None)

    if status in CLOSING_STATES:
        open_incidents = (
            db.query(Incident)
            .filter(Incident.service_id == service.id, Incident.status != IncidentStatus.resolved)
            .all()
        )
        closed = None
        for inc in open_incidents:
            inc.status = IncidentStatus.resolved
            inc.resolved_at = now
            closed = inc
        if open_incidents:
            db.commit()
        # Only a return to active is a "recovery"; a deliberate stop just
        # closes the incident without a "восстановлен" message.
        recovered = closed if status == ServiceStatus.active else None
        return IncidentOutcome(None, False, recovered)

    # activating / transitional states: leave incidents as they are.
    return IncidentOutcome(None, False, None)
