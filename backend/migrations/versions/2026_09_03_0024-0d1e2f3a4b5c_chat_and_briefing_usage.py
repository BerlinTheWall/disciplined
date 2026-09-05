"""chat_usage (H3 daily chat rate limit) and briefing_usage (guaranteed
daily-briefing allowance, separate from tts_usage's routine pool)

Revision ID: 0d1e2f3a4b5c
Revises: 9c0d1e2f3a4b
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0d1e2f3a4b5c"
down_revision: str | None = "9c0d1e2f3a4b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "briefing_usage",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("date", sa.String(), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "chat_usage",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("date", sa.String(), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("chat_usage")
    op.drop_table("briefing_usage")
