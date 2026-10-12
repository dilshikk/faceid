"""TOTP 2FA helpers (TZ 7.1)."""
import pyotp

from app.core.totp import generate_secret, provisioning_uri, role_requires_2fa, verify_code


def test_valid_code_accepted():
    secret = generate_secret()
    assert verify_code(secret, pyotp.TOTP(secret).now())


def test_wrong_or_malformed_code_rejected():
    secret = generate_secret()
    assert not verify_code(secret, None)
    assert not verify_code(secret, "")
    assert not verify_code(secret, "abcdef")
    assert not verify_code(secret, "12345")
    good = pyotp.TOTP(secret).now()
    bad = str((int(good) + 1) % 1_000_000).zfill(6)
    assert not verify_code(secret, bad)


def test_admin_roles_require_2fa():
    assert role_requires_2fa("owner")
    assert role_requires_2fa("admin")
    assert not role_requires_2fa("viewer")


def test_provisioning_uri_contains_issuer():
    assert "Bot%20Control%20Center" in provisioning_uri(generate_secret(), "owner")
