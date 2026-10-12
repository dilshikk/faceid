"""Enable (or reset) TOTP two-factor authentication for an existing user.

Usage (from /opt/bot-control-center/backend, with bcc.env loaded):

    .venv/bin/python -m app.cli.enable_2fa USERNAME

Prints the secret and an otpauth:// URI once. Add it to Google
Authenticator / Aegis / 1Password, then sign in with the 6-digit code.
Resetting revokes all existing sessions of that user.
"""
import argparse
import sys

from app.core.totp import generate_secret, provisioning_uri
from app.db import SessionLocal
from app.models.models import AuditLog, User, UserSession


def enable_2fa_for(db, user: User) -> str:
    secret = generate_secret()
    user.totp_secret = secret
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.add(AuditLog(actor="cli", action=f"enable_2fa:{user.username}", result="success"))
    db.commit()
    return secret


def print_secret(username: str, secret: str) -> None:
    print("2FA enabled. Add this to your authenticator app (shown only once):")
    print(f"  secret: {secret}")
    print(f"  uri:    {provisioning_uri(secret, username)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Enable TOTP 2FA for a BCC user")
    parser.add_argument("username")
    args = parser.parse_args()

    with SessionLocal() as db:
        user = db.query(User).filter(User.username == args.username).one_or_none()
        if user is None:
            print(f"User '{args.username}' not found.", file=sys.stderr)
            return 1
        print_secret(user.username, enable_2fa_for(db, user))
    return 0


if __name__ == "__main__":
    sys.exit(main())
