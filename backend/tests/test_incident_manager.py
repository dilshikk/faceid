"""Unit tests for incident fingerprinting (dedup logic, TZ section 5)."""
from app.services.incident_manager import make_fingerprint
from app.models.models import ServiceStatus


def test_fingerprint_stable_for_same_unit_and_status():
    a = make_fingerprint("mado-bot.service", ServiceStatus.failed)
    b = make_fingerprint("mado-bot.service", ServiceStatus.failed)
    assert a == b


def test_fingerprint_differs_for_different_status():
    a = make_fingerprint("mado-bot.service", ServiceStatus.failed)
    b = make_fingerprint("mado-bot.service", ServiceStatus.unknown)
    assert a != b
