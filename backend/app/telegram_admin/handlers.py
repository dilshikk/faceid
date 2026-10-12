"""Telegram Admin Bot commands (TZ 4.4). Runs as its own process
(bcc-adminbot.service), separate from the API and worker.

Every handler checks the sender's Telegram ID against telegram_admins
before doing anything. No command executes shell code or restarts services.

Database access is synchronous (SQLAlchemy), so it always runs in a worker
thread via `_with_db`. Calling it directly inside an async handler would
freeze the whole bot (all users) for the duration of each query.
"""
import asyncio
from collections.abc import Callable
from typing import TypeVar

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import SessionLocal
from app.models.models import Incident, IncidentStatus, MonitoredService
from app.repositories.repositories import (
    create_service,
    latest_server_metric,
    latest_status,
    list_services,
    silence_event_type,
)
from app.services.journal_reader import read_unit_logs
from app.services.systemd_monitor import is_valid_unit_name, normalize_unit_name

router = Router()

T = TypeVar("T")


def _is_allowed(telegram_id: int) -> bool:
    settings = get_settings()
    return telegram_id in settings.telegram_admin_ids_list


def _run_with_session(fn: Callable[[Session], T]) -> T:
    # The session is created, used and closed inside one worker thread.
    db = SessionLocal()
    try:
        return fn(db)
    finally:
        db.close()


async def _with_db(fn: Callable[[Session], T]) -> T:
    return await asyncio.to_thread(_run_with_session, fn)


def _find_service(db: Session, unit_name: str) -> MonitoredService | None:
    return db.query(MonitoredService).filter(MonitoredService.unit_name == unit_name).first()


# --- synchronous DB work, executed through _with_db -------------------------


def _status_text(db: Session) -> str:
    lines = []
    for s in list_services(db, limit=200)[0]:
        latest = latest_status(db, s.id)
        lines.append(f"{s.unit_name}: {latest.status.value if latest else 'unknown'}")
    return "\n".join(lines) or "Нет зарегистрированных служб."


def _services_text(db: Session) -> str:
    names = [s.unit_name for s in list_services(db, limit=200)[0]]
    return "\n".join(names) or "Список пуст."


def _service_text(db: Session, unit_name: str) -> str:
    service = _find_service(db, unit_name)
    if service is None:
        return "Служба нет в реестре разрешённых."
    latest = latest_status(db, service.id)
    return (
        f"{service.unit_name}\nстатус: {latest.status.value if latest else 'unknown'}"
        f"\nPID: {latest.pid if latest else '-'}"
    )


def _add_service(db: Session, name: str, unit_name: str) -> str:
    if _find_service(db, unit_name) is not None:
        return "Служба уже зарегистрирована."
    settings = get_settings()
    create_service(db, name, unit_name, settings.monitor_default_interval_seconds)
    return f"Служба {unit_name} добавлена в реестр."


def _is_registered(db: Session, unit_name: str) -> bool:
    return _find_service(db, unit_name) is not None


def _incidents_text(db: Session) -> str:
    open_incidents = db.query(Incident).filter(Incident.status != IncidentStatus.resolved).all()
    if not open_incidents:
        return "Нет открытых инцидентов."
    return "\n".join(f"{i.service_id}: {i.severity} ({i.status.value})" for i in open_incidents)


def _server_text(db: Session) -> str:
    metric = latest_server_metric(db)
    if metric is None:
        return "Метрики ещё не собраны."
    return (
        f"CPU: {metric.cpu_percent:.1f}%\nRAM: {metric.ram_percent:.1f}%"
        f"\nДиск: {metric.disk_percent:.1f}%\nUptime: {metric.uptime_seconds // 3600}ч"
    )


def _silence(db: Session, event_type: str, minutes: int) -> None:
    silence_event_type(db, event_type, minutes)


# --- handlers ---------------------------------------------------------------


@router.message(Command("start"))
async def cmd_start(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        await message.answer("Доступ запрещён.")
        return
    await message.answer("Bot Control Center admin bot. /help для списка команд.")


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    await message.answer(
        "/status — сводка\n"
        "/services — список служб\n"
        "/service <unit> — детали\n"
        "/addservice <имя> <unit> — зарегистрировать новую службу\n"
        "/logs <unit> — последние ошибки\n"
        "/incidents — открытые инциденты\n"
        "/server — CPU/RAM/диск/uptime\n"
        "/silence <event_type> <минуты> — утишить уведомления на N минут (0 — снять)"
    )


@router.message(Command("status"))
async def cmd_status(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    await message.answer(await _with_db(_status_text))


@router.message(Command("services"))
async def cmd_services(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    await message.answer(await _with_db(_services_text))


@router.message(Command("service"))
async def cmd_service(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: /service <unit_name>")
        return
    # Accept short names like "mado-bot" as shown in the TZ examples, not
    # just the full "mado-bot.service".
    unit_name = normalize_unit_name(parts[1])
    await message.answer(await _with_db(lambda db: _service_text(db, unit_name)))


@router.message(Command("addservice"))
async def cmd_addservice(message: Message) -> None:
    """Register a new allowlisted service (TZ section 2). Previously the
    only way to do this was a manual DB insert."""
    if not _is_allowed(message.from_user.id):
        return
    parts = (message.text or "").split(maxsplit=2)
    if len(parts) < 3:
        await message.answer("Использование: /addservice <имя> <unit_name>")
        return
    name, raw_unit = parts[1], parts[2]
    unit_name = normalize_unit_name(raw_unit)
    if not is_valid_unit_name(unit_name):
        await message.answer(
            "Некорректное имя unit: без пробелов и слэшей, суффикс .service добавляется автоматически."
        )
        return
    await message.answer(await _with_db(lambda db: _add_service(db, name, unit_name)))


@router.message(Command("logs"))
async def cmd_logs(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: /logs <unit_name>")
        return
    unit_name = normalize_unit_name(parts[1])
    if not await _with_db(lambda db: _is_registered(db, unit_name)):
        await message.answer("Служба нет в реестре разрешённых.")
        return
    lines = await read_unit_logs(unit_name, limit=20)
    text = "\n".join(lines[-20:]) or "Нет записей."
    await message.answer(text[:3800])


@router.message(Command("incidents"))
async def cmd_incidents(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    await message.answer(await _with_db(_incidents_text))


@router.message(Command("server"))
async def cmd_server(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    await message.answer(await _with_db(_server_text))


@router.message(Command("silence"))
async def cmd_silence(message: Message) -> None:
    """Actually silence notifications for an event type (previously this
    was a placeholder reply with no effect)."""
    if not _is_allowed(message.from_user.id):
        return
    parts = (message.text or "").split(maxsplit=2)
    if len(parts) < 3 or not parts[2].lstrip("-").isdigit():
        await message.answer("Использование: /silence <event_type> <минуты> (0 — снять утишение)")
        return
    event_type, minutes_raw = parts[1], parts[2]
    minutes = int(minutes_raw)
    await _with_db(lambda db: _silence(db, event_type, minutes))
    if minutes > 0:
        await message.answer(f"Уведомления '{event_type}' утишены на {minutes} мин.")
    else:
        await message.answer(f"Утишение для '{event_type}' снято.")
