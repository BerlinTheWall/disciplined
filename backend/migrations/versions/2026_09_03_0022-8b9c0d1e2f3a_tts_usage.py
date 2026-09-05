"""tts_usage table — per-user monthly character quota for /api/tts, backing
the cap that closes the max-length x max-count cost gap in that endpoint

Revision ID: 8b9c0d1e2f3a
Revises: 7a8b9c0d1e2f
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "8b9c0d1e2f3a"
down_revision: str | None = "7a8b9c0d1e2f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tts_usage",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("year_month", sa.String(), primary_key=True),
        sa.Column("chars_used", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("tts_usage")
