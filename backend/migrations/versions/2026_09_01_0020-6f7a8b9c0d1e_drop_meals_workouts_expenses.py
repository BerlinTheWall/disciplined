"""Drop meals/workouts/expenses: workout_sessions, meals tables and their
link columns on events/habits

The Meals, Workout, and Expenses app sections were removed. Expenses had no
backend table (device-local only), so this only drops workout_sessions,
meals, and the workout_session_id/recipe_id/shopping_list_id columns that
linked events/habits to them.

Revision ID: 6f7a8b9c0d1e
Revises: 5e6f7a8b9c0d
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "6f7a8b9c0d1e"
down_revision: str | None = "5e6f7a8b9c0d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Migrations are snapshots and must not import from app.models (which keeps
# changing); spell the JSON variant out locally instead.
JsonList = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.drop_column("events", "shopping_list_id")
    op.drop_column("events", "workout_session_id")
    op.drop_column("events", "recipe_id")
    op.drop_column("habits", "workout_session_id")
    op.drop_column("habits", "recipe_id")

    op.drop_index("ix_meals_date", table_name="meals")
    op.drop_index("ix_meals_user_id", table_name="meals")
    op.drop_table("meals")

    op.drop_index("ix_workout_sessions_user_id", table_name="workout_sessions")
    op.drop_table("workout_sessions")


def downgrade() -> None:
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

    op.add_column("habits", sa.Column("recipe_id", sa.String(), nullable=True))
    op.add_column("habits", sa.Column("workout_session_id", sa.String(), nullable=True))
    op.add_column("events", sa.Column("recipe_id", sa.String(), nullable=True))
    op.add_column("events", sa.Column("workout_session_id", sa.String(), nullable=True))
    op.add_column("events", sa.Column("shopping_list_id", sa.String(), nullable=True))
