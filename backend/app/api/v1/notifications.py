"""Notification settings management, including per-event silencing
(TZ 5, 7, 8)."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.rate_limit import mutation_rate_limiter
from app.core.security import get_current_user, require_role
from app.db import get_db
from app.models.models import AuditLog, NotificationSetting, User
from app.schemas.schemas import NotificationSettingOut, NotificationSettingUpdate

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _to_out(row: NotificationSetting) -> NotificationSettingOut:
    return NotificationSettingOut(
        id=row.id,
        channel=row.channel,
        event_type=row.event_type,
        recipient=row.recipient,
        cooldown_seconds=row.cooldown_seconds,
        enabled=row.enabled,
        silence_until=row.silence_until,
    )


@router.get("/settings", response_model=list[NotificationSettingOut])
def list_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.query(NotificationSetting).all()
    return [_to_out(r) for r in rows]


@router.patch(
    "/settings/{setting_id}",
    response_model=NotificationSettingOut,
    dependencies=[Depends(mutation_rate_limiter)],
)
def update_setting(
    setting_id: str,
    payload: NotificationSettingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("owner", "admin")),
):
    row = db.get(NotificationSetting, setting_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Setting not found")

    if payload.cooldown_seconds is not None:
        row.cooldown_seconds = payload.cooldown_seconds
    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.silence_minutes is not None:
        # 0 (or any non-positive value) clears the silence.
        row.silence_until = (
            dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=payload.silence_minutes)
            if payload.silence_minutes > 0
            else None
        )

    db.add(AuditLog(actor=user.username, action=f"update_notification_setting:{setting_id}", result="success"))
    db.commit()

    return _to_out(row)
