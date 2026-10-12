"""Reads systemd unit status via `systemctl show`, restricted to an allowlist.

Security: this module NEVER accepts a unit name that isn't already registered
in monitored_services. It never runs `sudo systemctl start/stop/restart`.
Only read-only `show` calls with fixed arguments are issued.
"""
import asyncio
import datetime as dt
import re

from app.models.models import ServiceStatus

ALLOWED_PROPERTIES = "LoadState,ActiveState,SubState,MainPID,ExecMainStartTimestamp,NRestarts"

# Must start with an alphanumeric/underscore so a unit name can never be
# parsed by systemctl/journalctl as a command-line option (e.g. "--host=x").
_UNIT_NAME_RE = re.compile(r"[A-Za-z0-9_][A-Za-z0-9@:_.\-]*\.service")
_MAX_UNIT_NAME_LENGTH = 120

# `systemctl --timestamp=utc` prints e.g. "Mon 2026-10-12 08:00:00 UTC".
_TIMESTAMP_RE = re.compile(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+UTC")


class SystemdStatus:
    def __init__(
        self,
        state: ServiceStatus,
        pid: int | None,
        started_at: dt.datetime | None,
        restarts: int | None = None,
    ):
        self.state = state
        self.pid = pid
        self.started_at = started_at
        self.restarts = restarts

    def details(self) -> dict:
        """Extra fields persisted to service_status_history.details_json."""
        return {
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "restarts": self.restarts,
        }


def _unknown() -> SystemdStatus:
    return SystemdStatus(ServiceStatus.unknown, None, None)


def _map_state(active_state: str, sub_state: str) -> ServiceStatus:
    if active_state == "failed" or sub_state == "failed":
        return ServiceStatus.failed
    if active_state in ("active", "reloading"):
        return ServiceStatus.active
    if active_state == "activating":
        # Restart=on-failure crash loop: treat auto-restart as a failure,
        # otherwise a bot that crashes every few seconds never alerts.
        if sub_state == "auto-restart":
            return ServiceStatus.failed
        return ServiceStatus.activating
    if active_state == "deactivating":
        return ServiceStatus.activating
    if active_state == "inactive":
        return ServiceStatus.inactive
    return ServiceStatus.unknown


def parse_timestamp(raw: str) -> dt.datetime | None:
    match = _TIMESTAMP_RE.search(raw or "")
    if not match:
        return None
    return dt.datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc)


def parse_int(raw: str | None) -> int | None:
    return int(raw) if raw and raw.isdigit() else None


def is_valid_unit_name(unit_name: str) -> bool:
    return (
        bool(unit_name)
        and len(unit_name) <= _MAX_UNIT_NAME_LENGTH
        and _UNIT_NAME_RE.fullmatch(unit_name) is not None
    )


def normalize_unit_name(raw: str) -> str:
    """Append `.service` if the caller omitted it (`/service mado-bot`)."""
    name = raw.strip()
    if name and not name.endswith(".service"):
        name = f"{name}.service"
    return name


def parse_show_output(stdout: str) -> SystemdStatus:
    values: dict[str, str] = {}
    for line in stdout.splitlines():
        if "=" in line:
            key, _, value = line.partition("=")
            values[key] = value

    # A unit that does not exist reports ActiveState=inactive, which would
    # look like a healthy-but-stopped service. Surface it as unknown instead.
    if values.get("LoadState") == "not-found" or "ActiveState" not in values:
        return _unknown()

    state = _map_state(values.get("ActiveState", "unknown"), values.get("SubState", "unknown"))
    pid = parse_int(values.get("MainPID"))
    if pid == 0:
        pid = None
    started_at = parse_timestamp(values.get("ExecMainStartTimestamp", "")) if pid else None
    return SystemdStatus(state, pid, started_at, parse_int(values.get("NRestarts")))


async def read_unit_status(unit_name: str) -> SystemdStatus:
    """Run a fixed, read-only `systemctl show` for a single allowlisted unit."""
    if not is_valid_unit_name(unit_name):
        return _unknown()

    proc: asyncio.subprocess.Process | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "systemctl",
            "show",
            "--timestamp=utc",
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
        return _unknown()
    except OSError:
        return _unknown()

    # A failed check must never be shown as healthy (TZ 3).
    if proc.returncode not in (0, None):
        return _unknown()

    return parse_show_output(stdout.decode(errors="replace"))
