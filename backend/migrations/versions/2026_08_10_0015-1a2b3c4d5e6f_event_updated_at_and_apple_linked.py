"""Event.updated_at + Event.apple_linked (two-way calendar sync)

Revision ID: 1a2b3c4d5e6f
Revises: b4c5d6e7f8a9
Create Date: 2026-08-10

Note: apple_linked is added NOT NULL with a server_default, unlike every
other add_column in this project's history (which have all been nullable) —
existing rows need a real value, not just a Python-side default, since
SQLAlchemy's `default=` only applies to rows inserted through the ORM.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "1a2b3c4d5e6f"
down_revision: str | None = "b4c5d6e7f8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("events", sa.Column("updated_at", sa.String(), nullable=True))
    op.add_column(
        "events",
        sa.Column("apple_linked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("events", "apple_linked")
    op.drop_column("events", "updated_at")
