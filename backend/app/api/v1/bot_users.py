"""Per-bot database connection settings and a read-only user table viewer.

Any signed-in user can browse; only owner/admin can change connections.
The stored password is never returned by any endpoint.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.rate_limit import mutation_rate_limiter
from app.core.security import get_current_user, require_role
from app.db import get_db
from app.models.models import AuditLog, MonitoredService, User
from app.repositories.repositories import get_service
from app.schemas.schemas import BotDatabaseIn, BotDatabaseOut, BotTablesOut, BotUsersOut
from app.services.bot_db import (
    BotDbConfig,
    BotDbError,
    decrypt_password,
    encrypt_password,
    fetch_rows,
    list_tables,
)

router = APIRouter(prefix="/services", tags=["bot-database"])

CONFIG_KEY = "database"


def _service_or_404(db: Session, service_id: str) -> MonitoredService:
    service = get_service(db, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return service


def _stored(service: MonitoredService) -> dict | None:
    value = (service.config_json or {}).get(CONFIG_KEY)
    return value if isinstance(value, dict) else None


def _require_stored(service: MonitoredService) -> dict:
    stored = _stored(service)
    if stored is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "База данных для этого бота не настроена")
    return stored


def _to_config(stored: dict) -> BotDbConfig:
    encrypted = stored.get("password")
    return BotDbConfig(
        host=str(stored["host"]),
        port=int(stored["port"]),
        dbname=str(stored["dbname"]),
        user=str(stored["user"]),
        password=decrypt_password(encrypted) if encrypted else "",
    )


def _to_out(stored: dict | None) -> BotDatabaseOut:
    if stored is None:
        return BotDatabaseOut(configured=False)
    return BotDatabaseOut(
        configured=True,
        host=stored.get("host"),
        port=stored.get("port"),
        dbname=stored.get("dbname"),
        user=stored.get("user"),
        has_password=bool(stored.get("password")),
        users_table=stored.get("users_table"),
    )


@router.get("/{service_id}/database", response_model=BotDatabaseOut)
def get_database(
    service_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    return _to_out(_stored(_service_or_404(db, service_id)))


@router.put(
    "/{service_id}/database",
    response_model=BotDatabaseOut,
    dependencies=[Depends(mutation_rate_limiter)],
)
def save_database(
    service_id: str,
    payload: BotDatabaseIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("owner", "admin")),
):
    service = _service_or_404(db, service_id)
    previous = _stored(service) or {}
    stored = {
        "host": payload.host.strip(),
        "port": payload.port,
        "dbname": payload.dbname.strip(),
        "user": payload.user.strip(),
        # Empty password field means "keep the saved one".
        "password": encrypt_password(payload.password) if payload.password else previous.get("password"),
        "users_table": payload.users_table or None,
    }

    # Only save settings that actually connect, so the viewer never shows a broken config.
    try:
        tables = list_tables(_to_config(stored))
    except BotDbError as exc:
        db.add(AuditLog(actor=user.username, action=f"save_bot_database:{service.unit_name}", result="failure"))
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    if stored["users_table"] and stored["users_table"] not in tables:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Таблица {stored['users_table']} не найдена")

    # Reassign the dict so SQLAlchemy detects the JSON change.
    service.config_json = {**(service.config_json or {}), CONFIG_KEY: stored}
    db.add(AuditLog(actor=user.username, action=f"save_bot_database:{service.unit_name}", result="success"))
    db.commit()
    return _to_out(stored)


@router.delete(
    "/{service_id}/database",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(mutation_rate_limiter)],
)
def delete_database(
    service_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("owner", "admin")),
):
    service = _service_or_404(db, service_id)
    config = dict(service.config_json or {})
    config.pop(CONFIG_KEY, None)
    service.config_json = config
    db.add(AuditLog(actor=user.username, action=f"delete_bot_database:{service.unit_name}", result="success"))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{service_id}/database/tables", response_model=BotTablesOut)
def get_tables(
    service_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    stored = _require_stored(_service_or_404(db, service_id))
    try:
        return BotTablesOut(tables=list_tables(_to_config(stored)))
    except BotDbError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.get("/{service_id}/bot-users", response_model=BotUsersOut)
def get_bot_users(
    service_id: str,
    table: str | None = Query(default=None, max_length=200),
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0, le=1_000_000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stored = _require_stored(_service_or_404(db, service_id))
    target = table or stored.get("users_table")
    if not target:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Выберите таблицу")
    search = q.strip() if q else None
    try:
        page = fetch_rows(_to_config(stored), target, search or None, limit, offset)
    except BotDbError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return BotUsersOut(
        table=target,
        columns=page.columns,
        rows=page.rows,
        total=page.total,
        limit=limit,
        offset=offset,
    )
