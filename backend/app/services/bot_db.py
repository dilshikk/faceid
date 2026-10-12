"""Read-only access to the monitored bots' own PostgreSQL databases.

Each bot keeps its users in its own database. Connection settings are stored
per service in monitored_services.config_json["database"], with the password
encrypted by a key derived from SECRET_KEY. Every connection is forced
read-only and time-limited, so BCC can never modify or lock a bot's data
(TZ 1: BCC must not disturb the monitored applications).
"""
import base64
import datetime as dt
import decimal
import hashlib
import json
import math
import uuid
from dataclasses import dataclass

import psycopg
from cryptography.fernet import Fernet, InvalidToken
from psycopg import sql

CONNECT_TIMEOUT_SECONDS = 5
STATEMENT_TIMEOUT_MS = 10_000
MAX_CELL_LENGTH = 300
MASKED_VALUE = "••••••"
# Columns whose values must never reach the UI, even if the bot stores them.
_SENSITIVE_HINTS = ("password", "passwd", "token", "secret", "api_key", "apikey", "hash")
# Only order by the first column when its type is reliably sortable.
_ORDERABLE_TYPES = {
    "smallint",
    "integer",
    "bigint",
    "numeric",
    "real",
    "double precision",
    "date",
    "text",
    "character varying",
    "uuid",
    "timestamp without time zone",
    "timestamp with time zone",
}

CellValue = str | int | float | bool | None


class BotDbError(Exception):
    """Safe-to-show error about a bot database connection or query."""


@dataclass(frozen=True)
class BotDbConfig:
    host: str
    port: int
    dbname: str
    user: str
    password: str


@dataclass(frozen=True)
class BotRowsPage:
    columns: list[str]
    rows: list[list[CellValue]]
    total: int


def _fernet() -> Fernet:
    # Imported lazily so pure helpers stay importable without env config.
    from app.core.config import get_settings

    digest = hashlib.sha256(get_settings().secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_password(raw: str) -> str:
    return _fernet().encrypt(raw.encode()).decode()


def decrypt_password(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise BotDbError(
            "Сохранённый пароль не читается (сменился SECRET_KEY). Введите пароль заново."
        ) from exc


def _safe_message(exc: Exception) -> str:
    from app.core.security import mask_secret

    text = str(exc).strip()
    first_line = text.splitlines()[0] if text else exc.__class__.__name__
    return mask_secret(first_line)[:300]


def split_table_name(full_name: str) -> tuple[str, str]:
    schema, sep, name = full_name.partition(".")
    if not sep or not schema or not name:
        raise BotDbError("Таблица должна быть в формате schema.table")
    return schema, name


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def is_sensitive_column(name: str) -> bool:
    lowered = name.lower()
    return any(hint in lowered for hint in _SENSITIVE_HINTS)


def serialize_cell(value: object, sensitive: bool) -> CellValue:
    if value is None:
        return None
    if sensitive:
        return MASKED_VALUE
    if isinstance(value, bool | int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if isinstance(value, dt.datetime | dt.date | dt.time):
        return value.isoformat()
    if isinstance(value, decimal.Decimal | uuid.UUID):
        return str(value)
    if isinstance(value, bytes | bytearray | memoryview):
        return f"<{len(bytes(value))} байт>"
    if isinstance(value, dict | list):
        text = json.dumps(value, ensure_ascii=False, default=str)
    else:
        text = str(value)
    return text if len(text) <= MAX_CELL_LENGTH else text[:MAX_CELL_LENGTH] + "…"


def _connect(cfg: BotDbConfig) -> psycopg.Connection:
    try:
        return psycopg.connect(
            host=cfg.host,
            port=cfg.port,
            dbname=cfg.dbname,
            user=cfg.user,
            password=cfg.password,
            connect_timeout=CONNECT_TIMEOUT_SECONDS,
            options=(
                "-c default_transaction_read_only=on "
                f"-c statement_timeout={STATEMENT_TIMEOUT_MS}"
            ),
            autocommit=True,
        )
    except psycopg.Error as exc:
        raise BotDbError(f"Не удалось подключиться: {_safe_message(exc)}") from exc


def list_tables(cfg: BotDbConfig) -> list[str]:
    try:
        with _connect(cfg) as conn:
            rows = conn.execute(
                """
                select table_schema, table_name
                from information_schema.tables
                where table_schema not in ('pg_catalog', 'information_schema')
                  and table_type in ('BASE TABLE', 'VIEW')
                order by table_schema, table_name
                """
            ).fetchall()
    except psycopg.Error as exc:
        raise BotDbError(f"Ошибка запроса: {_safe_message(exc)}") from exc
    return [f"{schema}.{name}" for schema, name in rows]


def fetch_rows(
    cfg: BotDbConfig, table: str, query: str | None, limit: int, offset: int
) -> BotRowsPage:
    schema, name = split_table_name(table)
    try:
        with _connect(cfg) as conn:
            columns = conn.execute(
                """
                select column_name, data_type
                from information_schema.columns
                where table_schema = %s and table_name = %s
                order by ordinal_position
                """,
                (schema, name),
            ).fetchall()
            if not columns:
                raise BotDbError("Таблица не найдена или нет прав на чтение")

            # Identifier quoting makes the table name injection-safe.
            target = sql.Identifier(schema, name)
            where = sql.SQL("")
            params: list[object] = []
            if query:
                where = sql.SQL(" where t::text ilike %s")
                params.append(f"%{escape_like(query)}%")
            order = sql.SQL(" order by 1 desc") if columns[0][1] in _ORDERABLE_TYPES else sql.SQL("")

            total_row = conn.execute(
                sql.SQL("select count(*) from {} t").format(target) + where, params
            ).fetchone()
            data = conn.execute(
                sql.SQL("select * from {} t").format(target)
                + where
                + order
                + sql.SQL(" limit %s offset %s"),
                [*params, limit, offset],
            ).fetchall()
    except psycopg.Error as exc:
        raise BotDbError(f"Ошибка запроса: {_safe_message(exc)}") from exc

    names = [str(column[0]) for column in columns]
    sensitive = [is_sensitive_column(n) for n in names]
    rows = [[serialize_cell(value, sensitive[i]) for i, value in enumerate(row)] for row in data]
    return BotRowsPage(columns=names, rows=rows, total=int(total_row[0]) if total_row else 0)
