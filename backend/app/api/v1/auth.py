"""Auth endpoints: login/logout. Argon2id password check, cookie session.

No secrets or password hashes are ever returned in a response body.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import login_rate_limiter
from app.core.security import create_session, get_current_user, revoke_session, verify_password
from app.db import get_db
from app.models.models import AuditLog, User
from app.schemas.schemas import LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", dependencies=[Depends(login_rate_limiter)])
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    settings = get_settings()
    user = db.query(User).filter(User.username == payload.username).one_or_none()

    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        db.add(AuditLog(actor=payload.username, action="login", result="failure"))
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    token = create_session(db, user)
    db.add(AuditLog(actor=user.username, action="login", result="success"))
    db.commit()

    response.set_cookie(
        settings.session_cookie_name,
        token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.session_ttl_minutes * 60,
    )
    return {"ok": True, "role": user.role.value}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = get_settings()
    # Revoke the *actual* session token from the request cookie. Previously
    # this read a value off the outgoing Response (always empty/falsy), so
    # the session row in user_sessions was never deleted on logout.
    token = request.cookies.get(settings.session_cookie_name, "")
    revoke_session(db, token)
    response.delete_cookie(settings.session_cookie_name)
    db.add(AuditLog(actor=user.username, action="logout", result="success"))
    db.commit()
    return {"ok": True}
