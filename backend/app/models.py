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
    first_name: Mapped[str] = mapped_column(String, default="")
    last_name: Mapped[str] = mapped_column(String, default="")
    # Kept alongside first/last (rather than computed on read) since it's
    # what the rest of the app actually displays — signup fills it in as
    # "first last", but it stays independently editable later without having
    # to touch the name fields.
    display_name: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[str] = mapped_column(String)  # ISO datetime, UTC
    # Soft-gated: the account is fully usable before this flips (see
    # routers/auth.py) — it only marks whether a person actually owns the
    # inbox behind their email, for account-recovery purposes.
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # IANA zone name (e.g. "America/New_York"), set from the device at signup
    # and kept in sync by the frontend whenever it notices the device's zone
    # has changed (see PATCH /api/auth/timezone) — so it tracks someone who
    # travels instead of freezing at wherever they signed up. Nullable: older
    # accounts and anything created before this existed have none yet.
    timezone: Mapped[str | None] = mapped_column(String, nullable=True)
    # Login brute-force lockout (see routers/auth.py's login()). Resets to 0
    # on any successful login, or automatically once login_locked_until
    # passes — a lockout always grants a clean slate rather than stacking.
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    login_locked_until: Mapped[str | None] = mapped_column(String, nullable=True)  # ISO datetime, UTC
    # Caps how many proactive coach check-ins fire per day (see
    # services/coach.py's TIER_BUDGET). No billing exists yet, so this
    # defaults everyone to the top tier; wiring real subscriptions later is
    # just writing to this column instead of building the budget logic.
    coach_tier: Mapped[str] = mapped_column(String, default="plus")  # "free" | "plus"
    # Self-reported during onboarding (see OnboardingWizard.tsx's "what best
    # describes you" step) — picks which fake-week demo they see and doubles
    # as a segmentation signal. Nullable: optional question, skippable, and
    # every account created before this existed has none.
    segment: Mapped[str | None] = mapped_column(String, nullable=True)


class EmailCode(Base):
    """One-time codes emailed for email verification and password reset.

    Codes are stored hashed (sha256 — not bcrypt: these are short-lived,
    rate-limited, and attempt-capped, so a fast hash is fine and lets lookup
    stay a simple equality check) so a DB dump alone can't be used to claim
    someone's account. `purpose` keeps verify and reset codes from being
    interchangeable even though they share a table.
    """

    __tablename__ = "email_codes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String, index=True)
    purpose: Mapped[str] = mapped_column(String)  # "verify" | "reset"
    code_hash: Mapped[str] = mapped_column(String)
    expires_at: Mapped[str] = mapped_column(String)  # ISO datetime, UTC
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String)  # ISO datetime, UTC


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
    # Last day this habit is active; NULL means it never ends.
    end_date: Mapped[str | None] = mapped_column(String, nullable=True)
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


class Interest(Base):
    """A loose, unscheduled activity the user wants to make time for (e.g.
    "Reading") — lighter than a Habit (no fixed days/time), just a title the
    nudge engine watches for via completed-event title matches (see
    app.services.nudges.interest_gap_candidates)."""

    __tablename__ = "interests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    title: Mapped[str] = mapped_column(String)
    icon: Mapped[str] = mapped_column(String, default="default")
    created_at: Mapped[int] = mapped_column(BigInteger, default=0)  # epoch ms, same convention as Goal.created_at


class Goal(Base):
    """A weekly/monthly/yearly goal or plan (frontend: Goals & Plans).

    Progress comes from exactly one source, chosen implicitly by what's set
    (see app.services.tools.goal_to_dict, mirrored by the frontend's
    goalProgress.ts): linked tasks/goals (weighted) > milestones (plain
    count) > a numeric target > a bare done flag. `linked_goal_ids` may only
    reference goals in a strictly more granular period than this one (year
    -> month/week, month -> week, week -> none) — period nesting is a strict
    order, so that rule alone makes a link cycle structurally impossible
    without needing cycle-detection code.
    """

    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    period: Mapped[str] = mapped_column(String)  # week|month|year
    period_key: Mapped[str] = mapped_column(String)  # Monday ISO / "YYYY-MM" / "YYYY"
    title: Mapped[str] = mapped_column(String)
    note: Mapped[str | None] = mapped_column(String, nullable=True)  # private "why", collapsed in the UI
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    priority: Mapped[str | None] = mapped_column(String, nullable=True)  # low|medium|high
    # "order" is a reserved word in SQL — store it under a safe column name.
    order: Mapped[int] = mapped_column("sort_order", Integer, default=0)
    linked_task_ids: Mapped[list] = mapped_column(JSONB, default=list)
    linked_goal_ids: Mapped[list] = mapped_column(JSONB, default=list)
    # One weight map for both of the above — a task id and a goal id never
    # collide (both are uuid4 hex), so they can safely share one dict.
    weights: Mapped[dict] = mapped_column(JSONB, default=dict)  # id -> percent
    # Lightweight, embedded sub-steps — not separate Goal rows, since most of
    # them (a checklist inside one goal) don't deserve their own period slot
    # or priority the way a real linked goal does.
    milestones: Mapped[list] = mapped_column(JSONB, default=list)  # [{id, label, done}]
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
