from uuid import uuid4

from sqlalchemy import BigInteger, Boolean, Float, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def new_id() -> str:
    return uuid4().hex


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    display_name: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[str] = mapped_column(String)  # ISO datetime, UTC
    # Caps how many proactive coach check-ins fire per day (see
    # services/coach.py's TIER_BUDGET). No billing exists yet, so this
    # defaults everyone to the top tier; wiring real subscriptions later is
    # just writing to this column instead of building the budget logic.
    coach_tier: Mapped[str] = mapped_column(String, default="plus")  # "free" | "plus"


class Event(Base):
    """A scheduled block on the calendar (the frontend calls these Tasks)."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    # Nullable so the add-column migration works on existing tables; rows are
    # always stamped on create, and pre-auth rows get adopted by the first user.
    user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    title: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String, index=True)  # ISO date "2026-07-05"
    start_minutes: Mapped[int] = mapped_column(Integer)  # minutes since midnight
    duration_minutes: Mapped[int] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String, default="#6366f1")
    icon: Mapped[str] = mapped_column(String, default="default")
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    priority: Mapped[str | None] = mapped_column(String, nullable=True)  # low|medium|high
    reminder_minutes_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shopping_list_id: Mapped[str | None] = mapped_column(String, nullable=True)
    workout_session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    recipe_id: Mapped[str | None] = mapped_column(String, nullable=True)


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    title: Mapped[str] = mapped_column(String)
    start_minutes: Mapped[int] = mapped_column(Integer)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String, default="#6366f1")
    icon: Mapped[str] = mapped_column(String, default="default")
    days_of_week: Mapped[list] = mapped_column(JSONB, default=list)  # 0 = Sunday ... 6 = Saturday
    completed_dates: Mapped[list] = mapped_column(JSONB, default=list)  # ISO dates
    skipped_dates: Mapped[list] = mapped_column(JSONB, default=list)
    # Recurrence beyond "every week": freq picks the unit, interval how many of
    # them between occurrences (freq=weekly + interval=2 = every other week;
    # freq=monthly + interval=6 = every 6 months). anchor_date is the cycle's
    # first occurrence, the reference point interval math counts from — only
    # load-bearing when interval>1 or freq=="monthly"; NULL/interval=1 behaves
    # exactly like the original weekday-only model.
    freq: Mapped[str] = mapped_column(String, default="weekly")  # "weekly" | "monthly"
    interval: Mapped[int] = mapped_column(Integer, default=1)
    anchor_date: Mapped[str | None] = mapped_column(String, nullable=True)
    reminder_minutes_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    workout_session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    recipe_id: Mapped[str | None] = mapped_column(String, nullable=True)


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String, default="gym")  # gym|running|cycling|swimming|yoga|other
    color: Mapped[str] = mapped_column(String, default="#6366f1")
    exercises: Mapped[list] = mapped_column(JSONB, default=list)  # list of WorkoutExercise dicts


class Goal(Base):
    """A weekly/monthly/yearly goal or plan (frontend: Goals & Plans)."""

    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    period: Mapped[str] = mapped_column(String)  # week|month|year
    period_key: Mapped[str] = mapped_column(String)  # Monday ISO / "YYYY-MM" / "YYYY"
    title: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    priority: Mapped[str | None] = mapped_column(String, nullable=True)  # low|medium|high
    # "order" is a reserved word in SQL — store it under a safe column name.
    order: Mapped[int] = mapped_column("sort_order", Integer, default=0)
    task_ids: Mapped[list] = mapped_column(JSONB, default=list)  # linked task ids
    task_weights: Mapped[dict] = mapped_column(JSONB, default=dict)  # taskId -> percent
    created_at: Mapped[int] = mapped_column(BigInteger, default=0)  # epoch ms


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)  # breakfast|lunch|dinner|snack
    date: Mapped[str] = mapped_column(String, index=True)
    components: Mapped[list] = mapped_column(JSONB, default=list)  # [{itemId, servings}]
    recipe_id: Mapped[str | None] = mapped_column(String, nullable=True)
    servings_eaten: Mapped[float | None] = mapped_column(Float, nullable=True)
