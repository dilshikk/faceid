"""Reads recent journald entries for a single allowlisted unit, read-only.

Full logs always remain in journald. Only a bounded, filtered slice is
read here and the caller decides what (if anything) gets persisted into
log_events, per TZ 4.3.
"""
import asyncio

from app.core.security import mask_secret
from app.services.systemd_monitor import is_valid_unit_name


async def read_unit_logs(unit_name: str, limit: int = 200, since: str | None = None) -> list[str]:
    # Same strict check as systemd_monitor: no option-like or path-like names.
    if not is_valid_unit_name(unit_name):
        return []

    limit = max(1, min(limit, 500))

    args = ["-u", unit_name, "-n", str(limit), "--no-pager", "-o", "short-iso"]
    if since:
        # `since` is "YYYY-MM-DD HH:MM:SS" in UTC. Without the explicit suffix
        # journalctl would read it as server-local time.
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
    return [mask_secret(line) for line in lines]
