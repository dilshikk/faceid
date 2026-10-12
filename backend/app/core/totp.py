"""TOTP two-factor authentication helpers (TZ 7.1: 2FA for administrators).

The secret is never returned by the API. It is shown exactly once, by the
CLI, when 2FA is enabled for a user.
"""
import pyotp

ISSUER = "Bot Control Center"
# Roles that must have 2FA configured before they can sign in.
ROLES_REQUIRING_2FA = ("owner", "admin")


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, username: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=ISSUER)


def verify_code(secret: str, code: str | None) -> bool:
    if not code:
        return False
    code = code.strip().replace(" ", "")
    if not code.isdigit() or len(code) != 6:
        return False
    # valid_window=1 tolerates ~30s of clock drift between server and phone.
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def role_requires_2fa(role: str) -> bool:
    return role in ROLES_REQUIRING_2FA
