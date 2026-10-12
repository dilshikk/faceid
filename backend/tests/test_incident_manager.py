"""Unit tests for incident fingerprinting and systemd state mapping."""
from app.models.models import ServiceStatus
from app.services.incident_manager import make_fingerprint
from app.services.systemd_monitor import _map_state


def test_fingerprint_stable_for_same_unit():
    assert make_fingerprint("mado-bot.service") == make_fingerprint("mado-bot.service")


def test_fingerprint_differs_for_different_units():
    assert make_fingerprint("mado-bot.service") != make_fingerprint("bkbot.service")


def test_reloading_is_not_a_failure():
    assert _map_state("reloading", "reload") == ServiceStatus.active


def test_deactivating_is_transitional_not_failure():
    assert _map_state("deactivating", "stop-sigterm") == ServiceStatus.activating


def test_crash_loop_is_a_failure():
    assert _map_state("activating", "auto-restart") == ServiceStatus.failed


def test_basic_states():
    assert _map_state("active", "running") == ServiceStatus.active
    assert _map_state("inactive", "dead") == ServiceStatus.inactive
    assert _map_state("failed", "failed") == ServiceStatus.failed
