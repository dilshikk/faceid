"""Indexes for retention cleanup of server_metrics / user_sessions and for
looking up the last notification sent for an incident (reminders).

Run with: alembic upgrade head
"""
from alembic import op

revision = "0003_metrics_sessions_indexes"
down_revision = "0002_silence_and_cleanup_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_server_metrics_time", "server_metrics", ["observed_at"])
    op.create_index("ix_user_sessions_expires", "user_sessions", ["expires_at"])
    op.create_index(
        "ix_notification_deliveries_incident_time",
        "notification_deliveries",
        ["incident_id", "sent_at"],
    )
    op.create_index("ix_incidents_service_status", "incidents", ["service_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_incidents_service_status", table_name="incidents")
    op.drop_index("ix_notification_deliveries_incident_time", table_name="notification_deliveries")
    op.drop_index("ix_user_sessions_expires", table_name="user_sessions")
    op.drop_index("ix_server_metrics_time", table_name="server_metrics")
