"""Notification settings management (TZ 5, 7, 8)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_role
from app.db import get_db
from app.models.models import AuditLog, NotificationSetting, User
from app.schemas.schemas import NotificationSettingOut, NotificationSettingUpdate

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/settings", response_model=list[NotificationSettingOut])
def list_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.query(NotificationSetting).all()
    return [
        NotificationSettingOut(
            id=r.id,
            channel=r.channel,
            event_type=r.event_type,
            recipient=r.recipient,
            cooldown_seconds=r.cooldown_seconds,
            enabled=r.enabled,
        )
        for r in rows
    ]


@router.patch("/settings/{setting_id}", response_model=NotificationSettingOut)
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

    db.add(AuditLog(actor=user.username, action=f"update_notification_setting:{setting_id}", result="success"))
    db.commit()

    return NotificationSettingOut(
        id=row.id,
        channel=row.channel,
        event_type=row.event_type,
        recipient=row.recipient,
        cooldown_seconds=row.cooldown_seconds,
        enabled=row.enabled,
    )
