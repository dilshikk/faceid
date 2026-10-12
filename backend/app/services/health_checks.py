"""Checks critical external dependencies (Postgres, Telegram) and records
history in health_checks, per TZ section 6.

The previous dashboard implementation called `db.execute(func.now())`,
which passes a bare SQLAlchemy function construct (not an Executable) to
`Session.execute()` and raises on every call. `check_postgres` below runs
an actual trivial query instead.
"""
import datetime as dt

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import HealthCheck


def check_postgres(db: Session) -> bool:
    try:
        db.execute(select(1))
        return True
    except Exception:  # noqa: BLE001 - any DB failure means "unhealthy"
        return False


async def check_telegram() -> bool:
    settings = get_settings()
    if not settings.telegram_bot_token:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"https://api.telegram.org/bot{settings.telegram_bot_token}/getMe")
            return resp.status_code == 200
    except httpx.HTTPError:
        # Deliberately not logging the exception: its text contains the bot
        # token (it is part of the request URL).
        return False


def record_health_check(db: Session, dependency: str, is_healthy: bool, details: str | None = None) -> None:
    db.add(
        HealthCheck(
            dependency=dependency,
            is_healthy=is_healthy,
            checked_at=dt.datetime.now(dt.timezone.utc),
            details=details,
        )
    )
