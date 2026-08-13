"""Goal category and start date / duration

Revision ID: 4d5e6f7a8b9c
Revises: 3c4d5e6f7a8b
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4d5e6f7a8b9c"
down_revision: str | None = "3c4d5e6f7a8b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("goals", sa.Column("category", sa.String(), nullable=True))
    op.add_column("goals", sa.Column("start_date", sa.String(), nullable=True))
    op.add_column("goals", sa.Column("duration_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("goals", "duration_count")
    op.drop_column("goals", "start_date")
    op.drop_column("goals", "category")
