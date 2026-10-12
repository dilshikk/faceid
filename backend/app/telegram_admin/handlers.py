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
from app.repositories.repositories import latest_server_metric, latest_status, list_services
from app.services.journal_reader import read_unit_logs

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
        "/logs <unit> — последние ошибки\n"
        "/incidents — открытые инциденты\n"
        "/server — CPU/RAM/диск/uptime"
    )


@router.message(Command("status"))
async def cmd_status(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    db = _db()
    try:
        services = list_services(db)
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
        names = [s.unit_name for s in list_services(db)]
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
    unit_name = parts[1].strip()
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


@router.message(Command("logs"))
async def cmd_logs(message: Message) -> None:
    if not _is_allowed(message.from_user.id):
        return
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: /logs <unit_name>")
        return
    unit_name = parts[1].strip()
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
    if not _is_allowed(message.from_user.id):
        return
    await message.answer("Утишение уведомлений настраивается в разделе настроек веб-панели.")
