"""OutlookConnection/GoogleCalendarConnection.last_synced_at (two-way calendar sync)

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2b3c4d5e6f7a"
down_revision: str | None = "1a2b3c4d5e6f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("outlook_connections", sa.Column("last_synced_at", sa.String(), nullable=True))
    op.add_column(
        "google_calendar_connections", sa.Column("last_synced_at", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("google_calendar_connections", "last_synced_at")
    op.drop_column("outlook_connections", "last_synced_at")
