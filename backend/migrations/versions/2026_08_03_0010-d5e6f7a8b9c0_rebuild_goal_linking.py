"""Rebuild Goal linking: rename task_ids/task_weights, add linked_goal_ids/milestones/note

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "d5e6f7a8b9c0"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Migrations must not import from app.models; spell the JSON variant out here.
Json = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    # Existing values carry over untouched — a task id and a goal id never
    # collide (both are uuid4 hex), so the renamed `weights` column can go on
    # serving both linked_task_ids and the new linked_goal_ids.
    op.alter_column("goals", "task_ids", new_column_name="linked_task_ids")
    op.alter_column("goals", "task_weights", new_column_name="weights")
    op.add_column(
        "goals", sa.Column("linked_goal_ids", Json, nullable=False, server_default="[]")
    )
    op.add_column("goals", sa.Column("milestones", Json, nullable=False, server_default="[]"))
    op.add_column("goals", sa.Column("note", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("goals", "note")
    op.drop_column("goals", "milestones")
    op.drop_column("goals", "linked_goal_ids")
    op.alter_column("goals", "weights", new_column_name="task_weights")
    op.alter_column("goals", "linked_task_ids", new_column_name="task_ids")
