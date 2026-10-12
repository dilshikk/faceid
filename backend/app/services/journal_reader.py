"""Reads recent journald entries for a single allowlisted unit, read-only.

Full logs always remain in journald. Only a bounded, filtered slice is
read here and the caller decides what (if anything) gets persisted into
log_events, per TZ 4.3.
"""
import asyncio

from app.core.security import mask_secret


async def read_unit_logs(unit_name: str, limit: int = 200, since: str | None = None) -> list[str]:
    if not unit_name.endswith(".service") or "/" in unit_name or " " in unit_name:
        return []

    limit = max(1, min(limit, 500))

    args = ["-u", unit_name, "-n", str(limit), "--no-pager", "-o", "short-iso"]
    if since:
        # `since` is "YYYY-MM-DD HH:MM:SS" in UTC. journalctl interprets a
        # bare timestamp in the server's LOCAL timezone, so the explicit
        # " UTC" suffix is required or the filter shifts by the TZ offset.
        args += ["--since", f"{since} UTC"]

    try:
        proc = await asyncio.create_subprocess_exec(
            "journalctl",
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
    except (OSError, TimeoutError):
        return []

    lines = stdout.decode(errors="replace").splitlines()
    return [mask_secret(line) for line in lines]
