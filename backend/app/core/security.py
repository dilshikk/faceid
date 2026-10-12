"""Password hashing (Argon2id) and signed session tokens.

BCC never runs arbitrary shell commands and never stores secrets in
config_json or audit metadata. Tokens/passwords are masked before logging.
"""
import datetime as dt
import uuid

from fastapi import Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.models.models import User, UserSession

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw, hashed)


def create_session(db: Session, user: User) -> str:
    settings = get_settings()
    token = str(uuid.uuid4())
    expires_at = dt.datetime.now(dt.timezone.utc) + dt.timedelta(
        minutes=settings.session_ttl_minutes
    )
    db.add(UserSession(user_id=user.id, token=token, expires_at=expires_at))
    db.commit()
    return token


def revoke_session(db: Session, token: str) -> None:
    """Delete the session row matching this exact token, if any.

    Callers MUST pass the real cookie value (request.cookies.get(...)).
    Passing an empty/falsy token here is a no-op by design: it must never
    delete sessions by accident.
    """
    if not token:
        return
    db.query(UserSession).filter(UserSession.token == token).delete()
    db.commit()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    session = (
        db.query(UserSession)
        .filter(UserSession.token == token)
        .one_or_none()
    )
    now = dt.datetime.now(dt.timezone.utc)
    if session is None or session.expires_at < now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")

    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account disabled")
    return user


def require_role(*roles: str):
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return _dep


def mask_secret(value: str) -> str:
    """Mask likely-sensitive substrings before they ever reach logs/UI."""
    import re

    patterns = [
        r"(?i)(token|password|secret|api[_-]?key)\s*[=:]\s*\S+",
        r"[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}",  # JWT-like
    ]
    masked = value
    for pattern in patterns:
        masked = re.sub(pattern, "[REDACTED]", masked)
    return masked
