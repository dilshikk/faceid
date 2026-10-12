"""Add notification_settings.silence_until and cleanup-friendly indexes.

Supports the mute/silence feature (TZ 5/8) and bounded retention cleanup
(TZ acceptance criterion #12).

Run with: alembic upgrade head
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_silence_and_cleanup_indexes"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notification_settings",
        sa.Column("silence_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_log_events_time", "log_events", ["event_time"])
    op.create_index("ix_notification_deliveries_time", "notification_deliveries", ["sent_at"])
    op.create_index("ix_health_checks_time", "health_checks", ["checked_at"])


def downgrade() -> None:
    op.drop_index("ix_health_checks_time", table_name="health_checks")
    op.drop_index("ix_notification_deliveries_time", table_name="notification_deliveries")
    op.drop_index("ix_log_events_time", table_name="log_events")
    op.drop_column("notification_settings", "silence_until")
