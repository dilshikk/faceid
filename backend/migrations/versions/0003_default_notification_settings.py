"""Seed default notification settings.

Without these rows the Settings page is empty and nothing can be toggled or
silenced from the web UI (rows were only created lazily by /silence).

Run with: alembic upgrade head
"""
import uuid

from alembic import op
import sqlalchemy as sa

revision = "0003_default_notification_settings"
down_revision = "0002_silence_and_cleanup_indexes"
branch_labels = None
depends_on = None

DEFAULT_EVENT_TYPES = ["incident_open", "incident_recovered"]
RECIPIENT = "telegram_admins"


def upgrade() -> None:
    table = sa.table(
        "notification_settings",
        sa.column("id", sa.String),
        sa.column("channel", sa.String),
        sa.column("event_type", sa.String),
        sa.column("recipient", sa.String),
        sa.column("cooldown_seconds", sa.Integer),
        sa.column("enabled", sa.Boolean),
    )
    existing = {
        row[0]
        for row in op.get_bind().execute(
            sa.text("SELECT event_type FROM notification_settings WHERE channel = 'telegram'")
        )
    }
    rows = [
        {
            "id": str(uuid.uuid4()),
            "channel": "telegram",
            "event_type": event_type,
            "recipient": RECIPIENT,
            "cooldown_seconds": 900,
            "enabled": True,
        }
        for event_type in DEFAULT_EVENT_TYPES
        if event_type not in existing
    ]
    if rows:
        op.bulk_insert(table, rows)


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM notification_settings "
            "WHERE channel = 'telegram' AND recipient = :recipient AND event_type IN :types"
        ).bindparams(sa.bindparam("types", expanding=True), recipient=RECIPIENT).params(types=DEFAULT_EVENT_TYPES)
    )
