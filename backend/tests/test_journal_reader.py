"""journald reader: level detection, masking and failure of the data source."""
import pytest

from app.services import journal_reader
from app.services.journal_reader import detect_level, read_unit_logs


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("ERROR: db connection lost", "error"),
        ("Traceback (most recent call last):", "error"),
        ("aiogram.exceptions.TelegramNetworkError: Exception happened", "error"),
        ("CRITICAL shutting down", "error"),
        ("WARNING: slow response", "warning"),
        ("[warn] retrying", "warning"),
        ("Bot started polling", "info"),
    ],
)
def test_detect_level(message, expected):
    assert detect_level(message) == expected


async def test_invalid_unit_never_spawns_process(monkeypatch):
    async def boom(*_args, **_kwargs):
        raise AssertionError("journalctl must not be called")

    monkeypatch.setattr(journal_reader.asyncio, "create_subprocess_exec", boom)
    assert await read_unit_logs("--directory=/etc.service") == []


async def test_missing_journalctl_returns_empty(monkeypatch):
    async def missing(*_args, **_kwargs):
        raise FileNotFoundError("journalctl")

    monkeypatch.setattr(journal_reader.asyncio, "create_subprocess_exec", missing)
    assert await read_unit_logs("mado-bot.service") == []


class _FakeProc:
    returncode = 0

    def __init__(self, stdout: bytes):
        self._stdout = stdout

    async def communicate(self):
        return self._stdout, b""


async def test_secrets_masked_and_markers_dropped(monkeypatch):
    output = (
        "-- No entries --\n"
        "2026-10-12T10:00:00+0000 host bot[1]: using token=123456789:AAHsecretsecretsecretsecretsecret00\n"
    ).encode()

    async def fake(*_args, **_kwargs):
        return _FakeProc(output)

    monkeypatch.setattr(journal_reader.asyncio, "create_subprocess_exec", fake)
    lines = await read_unit_logs("mado-bot.service")
    assert len(lines) == 1
    assert "AAHsecret" not in lines[0]
    assert "[REDACTED]" in lines[0]


async def test_limit_is_clamped(monkeypatch):
    captured: list[tuple] = []

    async def fake(*args, **_kwargs):
        captured.append(args)
        return _FakeProc(b"")

    monkeypatch.setattr(journal_reader.asyncio, "create_subprocess_exec", fake)
    await read_unit_logs("mado-bot.service", limit=100000)
    args = captured[0]
    assert args[args.index("-n") + 1] == "500"
