"""Create the first (or any) BCC user. There is no self-registration, so this
is how the owner account is made after `alembic upgrade head`.

Usage (from /opt/bot-control-center/backend, with bcc.env loaded):

    .venv/bin/python -m app.cli.create_user USERNAME --role owner

The password is read interactively and never appears in shell history.
Owner/admin accounts get 2FA automatically (TZ 7.1); the TOTP secret is
printed once at the end.
"""
import argparse
import getpass
import sys

from app.cli.enable_2fa import enable_2fa_for, print_secret
from app.core.security import hash_password
from app.core.totp import role_requires_2fa
from app.db import SessionLocal
from app.models.models import User, UserRole

MIN_PASSWORD_LENGTH = 12
MAX_USERNAME_LENGTH = 60  # matches users.username column


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a Bot Control Center user")
    parser.add_argument("username")
    parser.add_argument("--role", choices=[r.value for r in UserRole], default=UserRole.owner.value)
    parser.add_argument("--with-2fa", action="store_true", help="Also enable 2FA for a viewer account")
    args = parser.parse_args()

    if not args.username or len(args.username) > MAX_USERNAME_LENGTH:
        print(f"Username must be 1-{MAX_USERNAME_LENGTH} characters.", file=sys.stderr)
        return 1

    password = getpass.getpass("Password: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Repeat password: "):
        print("Passwords do not match.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        if db.query(User).filter(User.username == args.username).one_or_none() is not None:
            print(f"User '{args.username}' already exists.", file=sys.stderr)
            return 1
        user = User(
            username=args.username,
            password_hash=hash_password(password),
            role=UserRole(args.role),
        )
        db.add(user)
        db.commit()
        print(f"Created user '{args.username}' with role '{args.role}'.")

        if role_requires_2fa(args.role) or args.with_2fa:
            print_secret(user.username, enable_2fa_for(db, user))
    return 0


if __name__ == "__main__":
    sys.exit(main())
