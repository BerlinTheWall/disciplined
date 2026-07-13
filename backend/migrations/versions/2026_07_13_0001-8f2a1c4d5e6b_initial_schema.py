"""Initial schema: users, events, habits, workout_sessions, meals

Mirrors the tables create_all had been building on SQLite, so an existing
database can be stamped with this revision instead of re-running it.

Revision ID: 8f2a1c4d5e6b
Revises:
Create Date: 2026-07-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "8f2a1c4d5e6b"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Migrations are snapshots and must not import from app.models (which keeps
# changing); spell the JSON variant out locally instead.
JsonList = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("start_minutes", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("color", sa.String(), nullable=False),
        sa.Column("icon", sa.String(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.Column("priority", sa.String(), nullable=True),
        sa.Column("reminder_minutes_before", sa.Integer(), nullable=True),
        sa.Column("shopping_list_id", sa.String(), nullable=True),
        sa.Column("workout_session_id", sa.String(), nullable=True),
        sa.Column("recipe_id", sa.String(), nullable=True),
    )
    op.create_index("ix_events_user_id", "events", ["user_id"])
    op.create_index("ix_events_date", "events", ["date"])

    op.create_table(
        "habits",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("start_minutes", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("color", sa.String(), nullable=False),
        sa.Column("icon", sa.String(), nullable=False),
        sa.Column("days_of_week", JsonList, nullable=False),
        sa.Column("completed_dates", JsonList, nullable=False),
        sa.Column("skipped_dates", JsonList, nullable=False),
        sa.Column("reminder_minutes_before", sa.Integer(), nullable=True),
        sa.Column("workout_session_id", sa.String(), nullable=True),
        sa.Column("recipe_id", sa.String(), nullable=True),
    )
    op.create_index("ix_habits_user_id", "habits", ["user_id"])

    op.create_table(
        "workout_sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("color", sa.String(), nullable=False),
        sa.Column("exercises", JsonList, nullable=False),
    )
    op.create_index("ix_workout_sessions_user_id", "workout_sessions", ["user_id"])

    op.create_table(
        "meals",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("components", JsonList, nullable=False),
        sa.Column("recipe_id", sa.String(), nullable=True),
        sa.Column("servings_eaten", sa.Float(), nullable=True),
    )
    op.create_index("ix_meals_user_id", "meals", ["user_id"])
    op.create_index("ix_meals_date", "meals", ["date"])


def downgrade() -> None:
    op.drop_table("meals")
    op.drop_table("workout_sessions")
    op.drop_table("habits")
    op.drop_table("events")
    op.drop_table("users")
