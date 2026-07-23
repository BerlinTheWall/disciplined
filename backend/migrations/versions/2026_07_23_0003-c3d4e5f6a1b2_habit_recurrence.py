"""Flexible habit recurrence: freq/interval/anchor_date

Revision ID: c3d4e5f6a1b2
Revises: a1b2c3d4e5f6
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a1b2"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "habits", sa.Column("freq", sa.String(), nullable=False, server_default="weekly")
    )
    op.add_column(
        "habits", sa.Column("interval", sa.Integer(), nullable=False, server_default="1")
    )
    op.add_column("habits", sa.Column("anchor_date", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("habits", "anchor_date")
    op.drop_column("habits", "interval")
    op.drop_column("habits", "freq")
