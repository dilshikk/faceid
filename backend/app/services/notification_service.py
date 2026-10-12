"""Sends Telegram notifications. Delivery failures never block monitoring.

Per TZ section 5/8: messages are short, contain no secrets or full
tracebacks, and respect per-setting cooldowns and silences.
"""
import datetime as dt
import html

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import Incident, MonitoredService, NotificationDelivery, NotificationSetting


def _safe_error(exc: httpx.HTTPError) -> str:
    """Describe a failed request WITHOUT the URL.

    The Telegram Bot API puts the bot token in the URL path, and str(exc)
    for httpx errors includes that URL. The result is stored in
    notification_deliveries.error, so only the exception type and HTTP
    status code may be kept.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code}"
    return type(exc).__name__


async def send_telegram_message(chat_id: int, text: str) -> tuple[bool, str | None]:
    settings = get_settings()
    if not settings.telegram_bot_token:
        return False, "telegram token not configured"

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
            resp.raise_for_status()
        return True, None
    except httpx.HTTPError as exc:
        return False, _safe_error(exc)


def format_incident_message(service: MonitoredService, incident: Incident) -> str:
    return (
        f"<b>Сервис:</b> {html.escape(service.unit_name)}\n"
        f"<b>Состояние:</b> {html.escape(incident.severity)}\n"
        f"<b>Время:</b> {incident.first_seen.isoformat()}\n"
        "<b>Действие:</b> откройте карточку сервиса и последние логи."
    )


def format_reminder_message(service: MonitoredService, incident: Incident) -> str:
    return (
        f"<b>Напоминание:</b> {html.escape(service.unit_name)} всё ещё недоступен\n"
        f"<b>Состояние:</b> {html.escape(incident.severity)}\n"
        f"<b>С:</b> {incident.first_seen.isoformat()}"
    )


def format_recovery_message(service: MonitoredService) -> str:
    return f"<b>Сервис:</b> {html.escape(service.unit_name)}\n<b>Состояние:</b> восстановлен"


def _matching_settings(db: Session, event_type: str) -> list[NotificationSetting]:
    return (
        db.query(NotificationSetting)
        .filter(NotificationSetting.channel == "telegram")
        .filter(NotificationSetting.event_type.in_([event_type, "all"]))
        .all()
    )


def is_notification_allowed(db: Session, event_type: str) -> bool:
    """Check notification_settings for this event type (or the "all" wildcard).

    - A currently active silence on ANY matching row blocks the send, so a
      silenced event type cannot be bypassed by another enabled row.
    - Otherwise at least one matching row must be enabled.

    If no settings exist yet for telegram at all, default to allowed so
    notifications keep working out of the box (TZ 5/8 default behaviour).
    """
    rows = _matching_settings(db, event_type)
    if not rows:
        return True

    now = dt.datetime.now(dt.timezone.utc)
    if any(row.silence_until and row.silence_until > now for row in rows):
        return False
    return any(row.enabled for row in rows)


def notification_cooldown_seconds(db: Session, event_type: str) -> int:
    """Cooldown between repeat notifications: the exact event_type row wins,
    then the "all" row, then NOTIFICATION_COOLDOWN_SECONDS. Previously both
    the column and the env setting were defined but never read."""
    rows = _matching_settings(db, event_type)
    exact = next((r for r in rows if r.event_type == event_type), None)
    row = exact or (rows[0] if rows else None)
    if row is not None:
        return row.cooldown_seconds
    return get_settings().notification_cooldown_seconds


def is_reminder_due(db: Session, incident: Incident, event_type: str = "incident_open") -> bool:
    """True when the last notification for this incident (or its start, if
    none was ever sent) is older than the cooldown. cooldown <= 0 disables
    reminders."""
    cooldown = notification_cooldown_seconds(db, event_type)
    if cooldown <= 0:
        return False
    last_sent = (
        db.query(func.max(NotificationDelivery.sent_at))
        .filter(NotificationDelivery.incident_id == incident.id)
        .scalar()
    )
    reference = last_sent or incident.first_seen
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=dt.timezone.utc)
    return dt.datetime.now(dt.timezone.utc) - reference >= dt.timedelta(seconds=cooldown)


async def notify_admins(db: Session, chat_ids: list[int], text: str, incident_id: str | None) -> None:
    for chat_id in chat_ids:
        success, error = await send_telegram_message(chat_id, text)
        db.add(
            NotificationDelivery(
                incident_id=incident_id,
                channel="telegram",
                status="sent" if success else "failed",
                sent_at=dt.datetime.now(dt.timezone.utc),
                error=error,
            )
        )
        # Commit per-send so a crash mid-loop doesn't lose delivery
        # bookkeeping for messages that already went out.
        db.commit()
