from uuid import uuid4

from sqlalchemy import JSON, Boolean, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def new_id() -> str:
    return uuid4().hex


class Event(Base):
    """A scheduled block on the calendar (the frontend calls these Tasks)."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String, index=True)  # ISO date "2026-07-05"
    start_minutes: Mapped[int] = mapped_column(Integer)  # minutes since midnight
    duration_minutes: Mapped[int] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String, default="#6366f1")
    icon: Mapped[str] = mapped_column(String, default="default")
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    priority: Mapped[str | None] = mapped_column(String, nullable=True)  # low|medium|high
    shopping_list_id: Mapped[str | None] = mapped_column(String, nullable=True)
    workout_session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    recipe_id: Mapped[str | None] = mapped_column(String, nullable=True)


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String)
    start_minutes: Mapped[int] = mapped_column(Integer)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String, default="#6366f1")
    icon: Mapped[str] = mapped_column(String, default="default")
    days_of_week: Mapped[list] = mapped_column(JSON, default=list)  # 0 = Sunday ... 6 = Saturday
    completed_dates: Mapped[list] = mapped_column(JSON, default=list)  # ISO dates
    skipped_dates: Mapped[list] = mapped_column(JSON, default=list)


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String, default="gym")  # gym|running|cycling|swimming|yoga|other
    color: Mapped[str] = mapped_column(String, default="#6366f1")
    exercises: Mapped[list] = mapped_column(JSON, default=list)  # list of WorkoutExercise dicts


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)  # breakfast|lunch|dinner|snack
    date: Mapped[str] = mapped_column(String, index=True)
    components: Mapped[list] = mapped_column(JSON, default=list)  # [{itemId, servings}]
    recipe_id: Mapped[str | None] = mapped_column(String, nullable=True)
    servings_eaten: Mapped[float | None] = mapped_column(Float, nullable=True)
