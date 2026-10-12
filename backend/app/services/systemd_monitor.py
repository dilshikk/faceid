"""Reads systemd unit status via `systemctl show`, restricted to an allowlist.

Security: this module NEVER accepts a unit name that isn't already registered
in monitored_services. It never runs `sudo systemctl start/stop/restart`.
Only read-only `show`/`is-active` calls with fixed arguments are issued.
"""
import asyncio
import datetime as dt

from app.models.models import ServiceStatus

ALLOWED_PROPERTIES = "ActiveState,SubState,MainPID,ExecMainStartTimestamp"


class SystemdStatus:
    def __init__(self, state: ServiceStatus, pid: int | None, started_at: dt.datetime | None):
        self.state = state
        self.pid = pid
        self.started_at = started_at


def _map_state(active_state: str, sub_state: str) -> ServiceStatus:
    if active_state == "active":
        return ServiceStatus.active
    if active_state == "activating":
        return ServiceStatus.activating
    if active_state == "failed" or sub_state == "failed":
        return ServiceStatus.failed
    if active_state == "inactive":
        return ServiceStatus.inactive
    return ServiceStatus.unknown


def is_valid_unit_name(unit_name: str) -> bool:
    return bool(unit_name) and unit_name.endswith(".service") and "/" not in unit_name and " " not in unit_name


def normalize_unit_name(raw: str) -> str:
    """Append `.service` if the caller omitted it.

    The TZ's own Telegram command examples use short names
    (`/service mado-bot`), but unit_name is always stored with the
    `.service` suffix. Without this, those example commands never matched
    any registered service.
    """
    name = raw.strip()
    if name and not name.endswith(".service"):
        name = f"{name}.service"
    return name


async def read_unit_status(unit_name: str) -> SystemdStatus:
    """Run a fixed, read-only `systemctl show` for a single allowlisted unit."""
    if not is_valid_unit_name(unit_name):
        return SystemdStatus(ServiceStatus.unknown, None, None)

    try:
        proc = await asyncio.create_subprocess_exec(
            "systemctl",
            "show",
            unit_name,
            f"--property={ALLOWED_PROPERTIES}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
    except (OSError, TimeoutError):
        return SystemdStatus(ServiceStatus.unknown, None, None)

    values: dict[str, str] = {}
    for line in stdout.decode().splitlines():
        if "=" in line:
            key, _, value = line.partition("=")
            values[key] = value

    active_state = values.get("ActiveState", "unknown")
    sub_state = values.get("SubState", "unknown")
    pid_raw = values.get("MainPID", "0")
    pid = int(pid_raw) if pid_raw.isdigit() and pid_raw != "0" else None

    return SystemdStatus(_map_state(active_state, sub_state), pid, None)
