"""Create the first (or any) BCC user. There is no self-registration, so this
is how the owner account is made after `alembic upgrade head`.

Usage (from /opt/bot-control-center/backend, with bcc.env loaded):

    .venv/bin/python -m app.cli.create_user USERNAME --role owner

The password is read interactively and never appears in shell history.
"""
import argparse
import getpass
import sys

from app.core.security import hash_password
from app.db import SessionLocal
from app.models.models import User, UserRole

MIN_PASSWORD_LENGTH = 12
MAX_USERNAME_LENGTH = 60  # matches users.username column


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a Bot Control Center user")
    parser.add_argument("username")
    parser.add_argument("--role", choices=[r.value for r in UserRole], default=UserRole.owner.value)
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
        db.add(
            User(
                username=args.username,
                password_hash=hash_password(password),
                role=UserRole(args.role),
            )
        )
        db.commit()

    print(f"Created user '{args.username}' with role '{args.role}'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
