"""Task (event) and habit description

Revision ID: 2f3a4b5c6d7e
Revises: 1e2f3a4b5c6d
Create Date: 2026-09-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2f3a4b5c6d7e"
down_revision: str | None = "1e2f3a4b5c6d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("events", sa.Column("description", sa.String(), nullable=True))
    op.add_column("habits", sa.Column("description", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("habits", "description")
    op.drop_column("events", "description")
