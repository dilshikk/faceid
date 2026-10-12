"""Sends Telegram notifications. Delivery failures never block monitoring.

Per TZ section 5/8: messages are short, contain no secrets or full
tracebacks, and respect per-setting cooldowns.
"""
import datetime as dt

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import Incident, MonitoredService, NotificationDelivery


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
    db.commit()
