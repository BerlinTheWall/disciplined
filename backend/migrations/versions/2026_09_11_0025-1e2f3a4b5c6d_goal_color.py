"""Goal color

Revision ID: 1e2f3a4b5c6d
Revises: 0d1e2f3a4b5c
Create Date: 2026-09-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "1e2f3a4b5c6d"
down_revision: str | None = "0d1e2f3a4b5c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("goals", sa.Column("color", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("goals", "color")
