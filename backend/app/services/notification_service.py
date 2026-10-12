"""Sends Telegram notifications. Delivery failures never block monitoring.

Per TZ section 5/8: messages are short, contain no secrets or full
tracebacks, and respect per-setting cooldowns and silences.
"""
import datetime as dt

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import Incident, MonitoredService, NotificationDelivery, NotificationSetting


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
        return False, str(exc)


def format_incident_message(service: MonitoredService, incident: Incident) -> str:
    return (
        f"<b>Сервис:</b> {service.unit_name}\n"
        f"<b>Состояние:</b> {incident.severity}\n"
        f"<b>Время:</b> {incident.first_seen.isoformat()}\n"
        "<b>Действие:</b> откройте карточку сервиса и последние логи."
    )


def format_recovery_message(service: MonitoredService) -> str:
    return f"<b>Сервис:</b> {service.unit_name}\n<b>Состояние:</b> восстановлен"


def is_notification_allowed(db: Session, event_type: str) -> bool:
    """Check notification_settings for an enabled, non-silenced row for this
    event type (or the "all" wildcard). Previously /silence was a Telegram
    placeholder with no effect on actual sends; this wires it up.

    If no settings exist yet for telegram at all, default to allowed so
    notifications keep working out of the box (TZ 5/8 default behaviour).
    """
    rows = (
        db.query(NotificationSetting)
        .filter(NotificationSetting.channel == "telegram")
        .filter(NotificationSetting.event_type.in_([event_type, "all"]))
        .all()
    )
    if not rows:
        return True

    now = dt.datetime.now(dt.timezone.utc)
    for row in rows:
        if not row.enabled:
            continue
        if row.silence_until and row.silence_until > now:
            continue
        return True
    return False


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
