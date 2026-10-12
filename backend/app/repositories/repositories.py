"""Thin query layer. Every lookup is scoped to the BCC's own tables only."""
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.models import (
    Incident,
    LogEvent,
    MonitoredService,
    ServerMetric,
    ServiceStatusHistory,
)


def list_services(db: Session) -> list[MonitoredService]:
    return db.query(MonitoredService).order_by(MonitoredService.name).all()


def get_service(db: Session, service_id: str) -> MonitoredService | None:
    return db.get(MonitoredService, service_id)


def latest_status(db: Session, service_id: str) -> ServiceStatusHistory | None:
    return (
        db.query(ServiceStatusHistory)
        .filter(ServiceStatusHistory.service_id == service_id)
        .order_by(desc(ServiceStatusHistory.observed_at))
        .first()
    )


def service_history(db: Session, service_id: str, limit: int = 100) -> list[ServiceStatusHistory]:
    return (
        db.query(ServiceStatusHistory)
        .filter(ServiceStatusHistory.service_id == service_id)
        .order_by(desc(ServiceStatusHistory.observed_at))
        .limit(limit)
        .all()
    )


def list_incidents(db: Session, status: str | None = None, limit: int = 100) -> list[Incident]:
    q = db.query(Incident)
    if status:
        q = q.filter(Incident.status == status)
    return q.order_by(desc(Incident.last_seen)).limit(limit).all()


def open_incident_for_fingerprint(db: Session, service_id: str, fingerprint: str) -> Incident | None:
    return (
        db.query(Incident)
        .filter(
            Incident.service_id == service_id,
            Incident.fingerprint == fingerprint,
            Incident.status != "resolved",
        )
        .one_or_none()
    )


def latest_server_metric(db: Session) -> ServerMetric | None:
    return db.query(ServerMetric).order_by(desc(ServerMetric.observed_at)).first()


def recent_log_events(db: Session, service_id: str, limit: int = 100) -> list[LogEvent]:
    return (
        db.query(LogEvent)
        .filter(LogEvent.service_id == service_id)
        .order_by(desc(LogEvent.event_time))
        .limit(limit)
        .all()
    )
