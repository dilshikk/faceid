"""Telegram Admin Bot commands (TZ 4.4). Runs as its own process
(bcc-adminbot.service), separate from the API and worker.

Every handler checks the sender's Telegram ID against telegram_admins
before doing anything. No command executes shell code or restarts services.
"""
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


def _is_allowed(telegram_id: int) -> bool:
    settings = get_settings()
    return telegram_id in settings.telegram_admin_ids_list


def _db() -> Session:
    return SessionLocal()


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
    db = _db()
    try:
        services = list_services(db, limit=200)[0]
        lines = []
        for s in services:
            latest = latest_status(db, s.id)
            lines.append(f"{s.unit_name}: {latest.status.value if latest else 'unknown'}")
        await message.answer("\n".join(lines) or "Нет зарегистрированных служб.")
    finally:
        db.close()


@router.message(Command("services"))
async def cmd_services(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    db = _db()
    try:
        names = [s.unit_name for s in list_services(db, limit=200)[0]]
        await message.answer("\n".join(names) or "Список пуст.")
    finally:
        db.close()


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
    db = _db()
    try:
        service = (
            db.query(MonitoredService)
            .filter(MonitoredService.unit_name == unit_name)
            .one_or_none()
        )
        if service is None:
            await message.answer("Служба нет в реестре разрешённых.")
            return
        latest = latest_status(db, service.id)
        await message.answer(
            f"{service.unit_name}\nстатус: {latest.status.value if latest else 'unknown'}\nPID: {latest.pid if latest else '-'}"
        )
    finally:
        db.close()


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
    db = _db()
    try:
        existing = db.query(MonitoredService).filter(MonitoredService.unit_name == unit_name).one_or_none()
        if existing is not None:
            await message.answer("Служба уже зарегистрирована.")
            return
        settings = get_settings()
        create_service(db, name, unit_name, settings.monitor_default_interval_seconds)
        await message.answer(f"Служба {unit_name} добавлена в реестр.")
    finally:
        db.close()


@router.message(Command("logs"))
async def cmd_logs(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: /logs <unit_name>")
        return
    unit_name = normalize_unit_name(parts[1])
    db = _db()
    try:
        service = (
            db.query(MonitoredService)
            .filter(MonitoredService.unit_name == unit_name)
            .one_or_none()
        )
        if service is None:
            await message.answer("Служба нет в реестре разрешённых.")
            return
        lines = await read_unit_logs(unit_name, limit=20)
        text = "\n".join(lines[-20:]) or "Нет записей."
        await message.answer(text[:3800])
    finally:
        db.close()


@router.message(Command("incidents"))
async def cmd_incidents(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    db = _db()
    try:
        open_incidents = (
            db.query(Incident).filter(Incident.status != IncidentStatus.resolved).all()
        )
        if not open_incidents:
            await message.answer("Нет открытых инцидентов.")
            return
        lines = [f"{i.service_id}: {i.severity} ({i.status.value})" for i in open_incidents]
        await message.answer("\n".join(lines))
    finally:
        db.close()


@router.message(Command("server"))
async def cmd_server(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    db = _db()
    try:
        metric = latest_server_metric(db)
        if metric is None:
            await message.answer("Метрики ещё не собраны.")
            return
        await message.answer(
            f"CPU: {metric.cpu_percent:.1f}%\nRAM: {metric.ram_percent:.1f}%\nДиск: {metric.disk_percent:.1f}%\nUptime: {metric.uptime_seconds // 3600}ч"
        )
    finally:
        db.close()


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
    db = _db()
    try:
        silence_event_type(db, event_type, minutes)
        if minutes > 0:
            await message.answer(f"Уведомления '{event_type}' утишены на {minutes} мин.")
        else:
            await message.answer(f"Утишение для '{event_type}' снято.")
    finally:
        db.close()
