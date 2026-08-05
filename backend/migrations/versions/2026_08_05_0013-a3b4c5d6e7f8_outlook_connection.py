"""Outlook connection (Microsoft Graph OAuth) + Event.outlook_event_id/signature

Revision ID: a3b4c5d6e7f8
Revises: f1a2b3c4d5e6
Create Date: 2026-08-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "outlook_connections",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("ms_account_email", sa.String(), nullable=False),
        sa.Column("encrypted_access_token", sa.String(), nullable=False),
        sa.Column("encrypted_refresh_token", sa.String(), nullable=False),
        sa.Column("access_token_expires_at", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("connected_at", sa.String(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_outlook_connection_user"),
    )
    op.create_index("ix_outlook_connections_user_id", "outlook_connections", ["user_id"])

    op.add_column("events", sa.Column("outlook_event_id", sa.String(), nullable=True))
    op.add_column("events", sa.Column("outlook_sync_signature", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "outlook_sync_signature")
    op.drop_column("events", "outlook_event_id")
    op.drop_table("outlook_connections")
