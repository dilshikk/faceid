"""Reads recent journald entries for a single allowlisted unit, read-only.

Full logs always remain in journald. Only a bounded, filtered slice is
read here and the caller decides what (if anything) gets persisted into
log_events, per TZ 4.3.
"""
import asyncio
import re

from app.core.security import mask_secret
from app.services.systemd_monitor import is_valid_unit_name

LOG_LEVELS = ("error", "warning", "info")

_ERROR_RE = re.compile(r"\b(ERROR|CRITICAL|FATAL|Traceback|Exception|Error:)", re.IGNORECASE)
_WARNING_RE = re.compile(r"\b(WARN|WARNING)\b", re.IGNORECASE)


def detect_level(message: str) -> str:
    """Best-effort level from the message text (bots log in different formats)."""
    if _ERROR_RE.search(message):
        return "error"
    if _WARNING_RE.search(message):
        return "warning"
    return "info"


async def read_unit_logs(unit_name: str, limit: int = 200, since: str | None = None) -> list[str]:
    # Same strict validator as the systemd monitor: never pass anything that
    # could be parsed as a journalctl option.
    if not is_valid_unit_name(unit_name):
        return []

    limit = max(1, min(limit, 500))

    args = ["-u", unit_name, "-n", str(limit), "--no-pager", "-o", "short-iso"]
    if since:
        # journalctl interprets a bare timestamp in LOCAL time; force UTC.
        args += ["--since", f"{since} UTC"]

    proc: asyncio.subprocess.Process | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "journalctl",
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
    except TimeoutError:
        if proc is not None and proc.returncode is None:
            proc.kill()
            await proc.wait()
        return []
    except OSError:
        return []

    lines = stdout.decode(errors="replace").splitlines()
    # journalctl prints "-- No entries --" / "-- Boot ... --" markers.
    return [mask_secret(line) for line in lines if not line.startswith("-- ")]
