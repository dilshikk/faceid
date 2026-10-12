"""Reads systemd unit status via `systemctl show`, restricted to an allowlist.

Security: this module NEVER accepts a unit name that isn't already registered
in monitored_services. It never runs `sudo systemctl start/stop/restart`.
Only read-only `show`/`is-active` calls with fixed arguments are issued.
"""
import asyncio
import datetime as dt
import re

from app.models.models import ServiceStatus

ALLOWED_PROPERTIES = "LoadState,ActiveState,SubState,MainPID,ExecMainStartTimestamp"

# Must start with an alphanumeric/underscore so a unit name can never be
# parsed by systemctl/journalctl as a command-line option (e.g. "--host=x").
_UNIT_NAME_RE = re.compile(r"[A-Za-z0-9_][A-Za-z0-9@:_.\-]*\.service")
_MAX_UNIT_NAME_LENGTH = 120


class SystemdStatus:
    def __init__(self, state: ServiceStatus, pid: int | None, started_at: dt.datetime | None):
        self.state = state
        self.pid = pid
        self.started_at = started_at


def _map_state(active_state: str, sub_state: str) -> ServiceStatus:
    if active_state == "failed" or sub_state == "failed":
        return ServiceStatus.failed
    if active_state in ("active", "reloading"):
        # reloading = the process is running and re-reading its config.
        return ServiceStatus.active
    if active_state == "activating":
        # Restart=on-failure crash loop: systemd keeps the unit in
        # activating/auto-restart between attempts. Treat it as a failure,
        # otherwise a bot that crashes every few seconds never alerts.
        if sub_state == "auto-restart":
            return ServiceStatus.failed
        return ServiceStatus.activating
    if active_state == "deactivating":
        # Transitional state during stop/restart. Previously mapped to
        # unknown (= failure), which produced false alerts on every restart.
        return ServiceStatus.activating
    if active_state == "inactive":
        return ServiceStatus.inactive
    return ServiceStatus.unknown


def is_valid_unit_name(unit_name: str) -> bool:
    return (
        bool(unit_name)
        and len(unit_name) <= _MAX_UNIT_NAME_LENGTH
        and _UNIT_NAME_RE.fullmatch(unit_name) is not None
    )


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

    proc: asyncio.subprocess.Process | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "systemctl",
            "show",
            f"--property={ALLOWED_PROPERTIES}",
            "--",  # end of options: the unit name is never treated as a flag
            unit_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
    except TimeoutError:
        if proc is not None and proc.returncode is None:
            proc.kill()  # do not leave a hung systemctl behind on every poll
            await proc.wait()
        return SystemdStatus(ServiceStatus.unknown, None, None)
    except OSError:
        return SystemdStatus(ServiceStatus.unknown, None, None)

    values: dict[str, str] = {}
    for line in stdout.decode(errors="replace").splitlines():
        if "=" in line:
            key, _, value = line.partition("=")
            values[key] = value

    # A unit that does not exist reports ActiveState=inactive, which would
    # look like a healthy-but-stopped service. Surface it as unknown instead.
    if values.get("LoadState") == "not-found":
        return SystemdStatus(ServiceStatus.unknown, None, None)

    active_state = values.get("ActiveState", "unknown")
    sub_state = values.get("SubState", "unknown")
    pid_raw = values.get("MainPID", "0")
    pid = int(pid_raw) if pid_raw.isdigit() and pid_raw != "0" else None

    return SystemdStatus(_map_state(active_state, sub_state), pid, None)
