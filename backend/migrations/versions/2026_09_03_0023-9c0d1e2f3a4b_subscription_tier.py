"""Rename users.coach_tier -> subscription_tier and set everyone to "pro"
for now (no billing exists yet — see app.tiers.require_tier)

Revision ID: 9c0d1e2f3a4b
Revises: 8b9c0d1e2f3a
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9c0d1e2f3a4b"
down_revision: str | None = "8b9c0d1e2f3a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("users", "coach_tier", new_column_name="subscription_tier")
    op.alter_column(
        "users", "subscription_tier", existing_type=sa.String(), server_default="pro"
    )
    op.execute("UPDATE users SET subscription_tier = 'pro'")


def downgrade() -> None:
    op.alter_column(
        "users", "subscription_tier", existing_type=sa.String(), server_default="plus"
    )
    op.alter_column("users", "subscription_tier", new_column_name="coach_tier")
