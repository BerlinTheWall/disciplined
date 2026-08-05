"""Google Calendar connection (Google OAuth) + Event.google_event_id/signature

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-08-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: str | None = "a3b4c5d6e7f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "google_calendar_connections",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("google_account_email", sa.String(), nullable=False),
        sa.Column("encrypted_access_token", sa.String(), nullable=False),
        sa.Column("encrypted_refresh_token", sa.String(), nullable=False),
        sa.Column("access_token_expires_at", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("connected_at", sa.String(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_google_calendar_connection_user"),
    )
    op.create_index(
        "ix_google_calendar_connections_user_id", "google_calendar_connections", ["user_id"]
    )

    op.add_column("events", sa.Column("google_event_id", sa.String(), nullable=True))
    op.add_column("events", sa.Column("google_sync_signature", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "google_sync_signature")
    op.drop_column("events", "google_event_id")
    op.drop_table("google_calendar_connections")
