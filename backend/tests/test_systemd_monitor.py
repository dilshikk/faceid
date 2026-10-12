"""systemd monitor: parsing, validation and failure of the data source (TZ 9, stage 2).

A failed check must never be reported as a healthy service.
"""
import asyncio
import datetime as dt

import pytest

from app.models.models import ServiceStatus
from app.services import systemd_monitor
from app.services.systemd_monitor import (
    is_valid_unit_name,
    normalize_unit_name,
    parse_show_output,
    parse_timestamp,
    read_unit_status,
)

ACTIVE_OUTPUT = """LoadState=loaded
ActiveState=active
SubState=running
MainPID=4242
ExecMainStartTimestamp=Mon 2026-10-12 08:00:00 UTC
NRestarts=3
"""


def test_parse_active_unit():
    status = parse_show_output(ACTIVE_OUTPUT)
    assert status.state == ServiceStatus.active
    assert status.pid == 4242
    assert status.restarts == 3
    assert status.started_at == dt.datetime(2026, 10, 12, 8, 0, tzinfo=dt.timezone.utc)


def test_not_found_unit_is_unknown():
    status = parse_show_output("LoadState=not-found\nActiveState=inactive\nMainPID=0\n")
    assert status.state == ServiceStatus.unknown


def test_empty_output_is_unknown():
    assert parse_show_output("").state == ServiceStatus.unknown


def test_stopped_unit_has_no_pid_or_start_time():
    status = parse_show_output(
        "LoadState=loaded\nActiveState=inactive\nSubState=dead\nMainPID=0\n"
        "ExecMainStartTimestamp=n/a\nNRestarts=0\n"
    )
    assert status.state == ServiceStatus.inactive
    assert status.pid is None
    assert status.started_at is None
    assert status.restarts == 0


def test_parse_timestamp_rejects_non_utc_and_garbage():
    assert parse_timestamp("n/a") is None
    assert parse_timestamp("") is None
    assert parse_timestamp("Mon 2026-10-12 08:00:00 MSK") is None


@pytest.mark.parametrize(
    "name",
    ["--host=evil.service", "a b.service", "../x.service", "mado-bot", "", "x" * 200 + ".service"],
)
def test_invalid_unit_names(name):
    assert not is_valid_unit_name(name)


@pytest.mark.parametrize("name", ["mado-bot.service", "getty@tty1.service", "tg_bot.service"])
def test_valid_unit_names(name):
    assert is_valid_unit_name(name)


def test_normalize_unit_name():
    assert normalize_unit_name(" mado-bot ") == "mado-bot.service"
    assert normalize_unit_name("bkbot.service") == "bkbot.service"


async def test_invalid_name_never_spawns_process(monkeypatch):
    async def boom(*_args, **_kwargs):
        raise AssertionError("systemctl must not be called")

    monkeypatch.setattr(systemd_monitor.asyncio, "create_subprocess_exec", boom)
    status = await read_unit_status("--host=evil.service")
    assert status.state == ServiceStatus.unknown


async def test_missing_systemctl_is_unknown(monkeypatch):
    async def missing(*_args, **_kwargs):
        raise FileNotFoundError("systemctl")

    monkeypatch.setattr(systemd_monitor.asyncio, "create_subprocess_exec", missing)
    status = await read_unit_status("mado-bot.service")
    assert status.state == ServiceStatus.unknown


class _FakeProc:
    def __init__(self, stdout: bytes = b"", returncode: int | None = 0, hang: bool = False):
        self._stdout = stdout
        self.returncode = returncode
        self._hang = hang
        self.killed = False

    async def communicate(self):
        if self._hang:
            await asyncio.sleep(3600)
        return self._stdout, b""

    def kill(self):
        self.killed = True
        self.returncode = -9

    async def wait(self):
        return self.returncode


async def test_nonzero_exit_is_unknown(monkeypatch):
    async def fake(*_args, **_kwargs):
        return _FakeProc(stdout=ACTIVE_OUTPUT.encode(), returncode=1)

    monkeypatch.setattr(systemd_monitor.asyncio, "create_subprocess_exec", fake)
    status = await read_unit_status("mado-bot.service")
    assert status.state == ServiceStatus.unknown


async def test_timeout_kills_process_and_is_unknown(monkeypatch):
    proc = _FakeProc(returncode=None, hang=True)

    async def fake(*_args, **_kwargs):
        return proc

    async def instant_timeout(awaitable, timeout):
        awaitable.close()
        raise TimeoutError

    monkeypatch.setattr(systemd_monitor.asyncio, "create_subprocess_exec", fake)
    monkeypatch.setattr(systemd_monitor.asyncio, "wait_for", instant_timeout)
    status = await read_unit_status("mado-bot.service")
    assert status.state == ServiceStatus.unknown
    assert proc.killed


async def test_success_path(monkeypatch):
    async def fake(*_args, **_kwargs):
        return _FakeProc(stdout=ACTIVE_OUTPUT.encode(), returncode=0)

    monkeypatch.setattr(systemd_monitor.asyncio, "create_subprocess_exec", fake)
    status = await read_unit_status("mado-bot.service")
    assert status.state == ServiceStatus.active
    assert status.details() == {"started_at": "2026-10-12T08:00:00+00:00", "restarts": 3}
