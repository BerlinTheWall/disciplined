"""Drop external_calendar_events (superseded by two-way calendar sync —
external events are now real Event rows, not a read-only mirror)

Revision ID: 3c4d5e6f7a8b
Revises: 2b3c4d5e6f7a
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3c4d5e6f7a8b"
down_revision: str | None = "2b3c4d5e6f7a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_external_calendar_events_start_at", table_name="external_calendar_events")
    op.drop_index(
        "ix_external_calendar_events_external_event_id", table_name="external_calendar_events"
    )
    op.drop_index(
        "ix_external_calendar_events_device_calendar_id", table_name="external_calendar_events"
    )
    op.drop_index("ix_external_calendar_events_user_id", table_name="external_calendar_events")
    op.drop_table("external_calendar_events")


def downgrade() -> None:
    # Schema-only reversal — any rows added between upgrade() and a
    # hypothetical downgrade() are unrecoverable, same as any other
    # destructive migration's downgrade.
    op.create_table(
        "external_calendar_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("device_calendar_id", sa.String(), nullable=False),
        sa.Column("device_calendar_name", sa.String(), nullable=False),
        sa.Column("source_label", sa.String(), nullable=False),
        sa.Column("external_event_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("start_at", sa.String(), nullable=False),
        sa.Column("end_at", sa.String(), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False),
        sa.Column("last_synced_at", sa.String(), nullable=False),
        sa.UniqueConstraint("user_id", "external_event_id", name="uq_external_calendar_event"),
    )
    op.create_index("ix_external_calendar_events_user_id", "external_calendar_events", ["user_id"])
    op.create_index(
        "ix_external_calendar_events_device_calendar_id",
        "external_calendar_events",
        ["device_calendar_id"],
    )
    op.create_index(
        "ix_external_calendar_events_external_event_id",
        "external_calendar_events",
        ["external_event_id"],
    )
    op.create_index("ix_external_calendar_events_start_at", "external_calendar_events", ["start_at"])
