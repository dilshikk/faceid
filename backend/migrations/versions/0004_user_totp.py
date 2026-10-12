"""Add users.totp_secret for two-factor authentication (TZ 7.1).

Run with: alembic upgrade head
"""
import sqlalchemy as sa
from alembic import op

revision = "0004_user_totp"
down_revision = "0003_metrics_sessions_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "totp_secret")
