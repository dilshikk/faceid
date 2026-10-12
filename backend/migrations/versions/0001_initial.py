"""Initial schema: all Bot Control Center tables (TZ section 6).

Run with: alembic upgrade head
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monitored_services",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("unit_name", sa.String(120), nullable=False, unique=True),
        sa.Column("type", sa.String(40), server_default="systemd"),
        sa.Column("enabled", sa.Boolean, server_default=sa.true()),
        sa.Column("interval_seconds", sa.Integer, server_default="15"),
        sa.Column("config_json", sa.JSON, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "service_status_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("service_id", sa.String(36), sa.ForeignKey("monitored_services.id")),
        sa.Column("status", sa.String(20)),
        sa.Column("pid", sa.Integer, nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True)),
        sa.Column("details_json", sa.JSON, server_default="{}"),
    )
    op.create_index("ix_status_history_service_time", "service_status_history", ["service_id", "observed_at"])

    op.create_table(
        "incidents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("service_id", sa.String(36), sa.ForeignKey("monitored_services.id")),
        sa.Column("fingerprint", sa.String(120)),
        sa.Column("severity", sa.String(20), server_default="error"),
        sa.Column("status", sa.String(20), server_default="open"),
        sa.Column("first_seen", sa.DateTime(timezone=True)),
        sa.Column("last_seen", sa.DateTime(timezone=True)),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.String(36), nullable=True),
    )
    op.create_index("ix_incidents_fingerprint", "incidents", ["fingerprint"])

    op.create_table(
        "log_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("service_id", sa.String(36), sa.ForeignKey("monitored_services.id")),
        sa.Column("source", sa.String(40), server_default="journald"),
        sa.Column("level", sa.String(20), server_default="error"),
        sa.Column("message", sa.Text),
        sa.Column("event_time", sa.DateTime(timezone=True)),
        sa.Column("fingerprint", sa.String(120)),
    )
    op.create_index("ix_log_events_fingerprint", "log_events", ["fingerprint"])

    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(60), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), server_default="viewer"),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("token", sa.String(64), unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked", sa.Boolean, server_default=sa.false()),
    )
    op.create_index("ix_user_sessions_token", "user_sessions", ["token"])

    op.create_table(
        "telegram_admins",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("telegram_id", sa.Integer, nullable=False, unique=True),
        sa.Column("label", sa.String(60), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
    )

    op.create_table(
        "notification_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("channel", sa.String(20), server_default="telegram"),
        sa.Column("event_type", sa.String(40)),
        sa.Column("recipient", sa.String(120)),
        sa.Column("cooldown_seconds", sa.Integer, server_default="900"),
        sa.Column("enabled", sa.Boolean, server_default=sa.true()),
    )

    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("incident_id", sa.String(36), sa.ForeignKey("incidents.id"), nullable=True),
        sa.Column("channel", sa.String(20)),
        sa.Column("status", sa.String(20)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("error", sa.Text, nullable=True),
    )

    op.create_table(
        "server_metrics",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("cpu_percent", sa.Float),
        sa.Column("ram_percent", sa.Float),
        sa.Column("disk_percent", sa.Float),
        sa.Column("uptime_seconds", sa.Integer),
        sa.Column("observed_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "health_checks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("dependency", sa.String(40)),
        sa.Column("is_healthy", sa.Boolean),
        sa.Column("checked_at", sa.DateTime(timezone=True)),
        sa.Column("details", sa.Text, nullable=True),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("actor", sa.String(120)),
        sa.Column("action", sa.String(120)),
        sa.Column("result", sa.String(20)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("metadata_json", sa.JSON, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("health_checks")
    op.drop_table("server_metrics")
    op.drop_table("notification_deliveries")
    op.drop_table("notification_settings")
    op.drop_table("telegram_admins")
    op.drop_table("user_sessions")
    op.drop_table("users")
    op.drop_table("log_events")
    op.drop_table("incidents")
    op.drop_table("service_status_history")
    op.drop_table("monitored_services")
