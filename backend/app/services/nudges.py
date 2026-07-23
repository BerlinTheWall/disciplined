"""Deterministic signal evaluation for the proactive nudge engine — no Gemini
here. Cheap enough to run on every app foreground; the router only spends a
Gemini call once this module actually returns a candidate."""

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Goal, Habit
from app.services.tools import _overlapping, current_period_keys, goal_to_dict, habit_occurrences

NudgeType = Literal["habit_gap", "workout_gap", "goal_pacing"]


@dataclass
class NudgeCandidate:
    type: NudgeType
    subject_id: str
    subject_title: str
    metric: dict[str, Any] = field(default_factory=dict)


def period_bounds(period: str, period_key: str) -> tuple[date, date]:
    """Inverse of current_period_keys: the [start, end] dates a period_key spans."""
    if period == "week":
        start = date.fromisoformat(period_key)
        return start, start + timedelta(days=6)
    if period == "month":
        y, m = (int(p) for p in period_key.split("-"))
        start = date(y, m, 1)
        next_month = date(y + (m == 12), (m % 12) + 1, 1)
        return start, next_month - timedelta(days=1)
    y = int(period_key)
    return date(y, 1, 1), date(y, 12, 31)


def _is_habit_active(habit: Habit, d: date) -> bool:
    js_weekday = (d.weekday() + 1) % 7  # python Mon=0 -> frontend Sun=0
    return js_weekday in (habit.days_of_week or []) and d.isoformat() not in (
        habit.skipped_dates or []
    )


def _habit_miss_streak(habit: Habit, today: date) -> int:
    """Consecutive active days, walking backward from yesterday (today is still
    in progress, so it's excluded), with no completion — mirrors the shape of
    the frontend's getHabitStreak but counts misses instead of hits."""
    completed = set(habit.completed_dates or [])
    cursor = today - timedelta(days=1)
    streak = 0
    for _ in range(3650):
        if _is_habit_active(habit, cursor):
            if cursor.isoformat() in completed:
                break
            streak += 1
        cursor -= timedelta(days=1)
    return streak


async def workout_gap_candidate(
    db: AsyncSession, user_id: str, today: date
) -> NudgeCandidate | None:
    last = await db.scalar(
        select(Event.date)
        .where(
            Event.user_id == user_id,
            Event.workout_session_id.is_not(None),
            Event.completed.is_(True),
        )
        .order_by(Event.date.desc())
        .limit(1)
    )
    if last is None:
        return None  # no workout history yet — never a "gap" on a fresh account
    gap_days = (today - date.fromisoformat(last)).days
    if gap_days < 4:
        return None
    return NudgeCandidate(
        type="workout_gap",
        subject_id="workout",
        subject_title="a workout",
        metric={"gap_days": gap_days, "last_date": last},
    )


async def habit_gap_candidates(
    db: AsyncSession, user_id: str, today: date
) -> list[NudgeCandidate]:
    habits = (await db.scalars(select(Habit).where(Habit.user_id == user_id))).all()
    out = []
    for h in habits:
        if not (h.completed_dates or []):
            continue  # never completed even once — too new to call it a gap
        miss = _habit_miss_streak(h, today)
        if miss >= 2:
            out.append(
                NudgeCandidate(
                    type="habit_gap",
                    subject_id=h.id,
                    subject_title=h.title,
                    metric={"miss_streak": miss},
                )
            )
    return out


async def goal_pacing_candidates(
    db: AsyncSession, user_id: str, today: date
) -> list[NudgeCandidate]:
    keys = current_period_keys(today)
    goals = (
        await db.scalars(
            select(Goal).where(Goal.user_id == user_id, Goal.period_key.in_(keys.values()))
        )
    ).all()
    out = []
    for g in goals:
        start, end = period_bounds(g.period, g.period_key)
        span_days = (end - start).days + 1
        elapsed = max(0.0, min(1.0, ((today - start).days + 1) / span_days))
        info = await goal_to_dict(db, user_id, g)
        if info["done"]:
            continue
        if info["mode"] in ("manual", "tasks") and info["total"] > 0:
            progress_fraction = info["current"] / info["total"]
            margin = elapsed - progress_fraction
            if elapsed >= 0.5 and margin >= 0.25:
                out.append(
                    NudgeCandidate(
                        type="goal_pacing",
                        subject_id=g.id,
                        subject_title=g.title,
                        metric={"elapsed": elapsed, "progress_fraction": progress_fraction, "margin": margin},
                    )
                )
        elif info["mode"] == "check" and elapsed >= 0.8:
            out.append(
                NudgeCandidate(
                    type="goal_pacing",
                    subject_id=g.id,
                    subject_title=g.title,
                    metric={"elapsed": elapsed, "margin": elapsed},
                )
            )
    return out


async def evaluate(
    db: AsyncSession, user_id: str, today: date, excluded: set[str]
) -> NudgeCandidate | None:
    """Fixed priority: workout_gap -> habit_gap -> goal_pacing. Within a type,
    the worst candidate wins. Excluded keys ("type:subject_id") are the
    client's own active dismissal cooldowns, so a suppressed candidate lets a
    lower-priority one still surface."""
    workout = await workout_gap_candidate(db, user_id, today)
    if workout is not None and f"{workout.type}:{workout.subject_id}" not in excluded:
        return workout

    habits = [
        c for c in await habit_gap_candidates(db, user_id, today)
        if f"{c.type}:{c.subject_id}" not in excluded
    ]
    if habits:
        return max(habits, key=lambda c: c.metric["miss_streak"])

    goals = [
        c for c in await goal_pacing_candidates(db, user_id, today)
        if f"{c.type}:{c.subject_id}" not in excluded
    ]
    if goals:
        return max(goals, key=lambda c: c.metric["margin"])

    return None


async def suggest_evening_slot(
    db: AsyncSession, user_id: str, today: date, now_minutes: int | None, duration: int = 60
) -> dict[str, Any] | None:
    """First free `duration`-minute slot between 18:00 and 21:00, today unless
    that window has effectively passed, else tomorrow. Reuses _overlapping —
    the same conflict check create_event uses — scanning in 15-minute steps.
    Only a sensible fallback when there's no natural time of day to anchor
    to (workout_gap has no single habit row to read a schedule from)."""
    window_start, window_end = 18 * 60, 21 * 60
    target_date = today
    if now_minutes is not None and now_minutes > window_end - duration:
        target_date = today + timedelta(days=1)

    candidate = window_start
    while candidate + duration <= window_end:
        date_str = target_date.isoformat()
        conflicts = await _overlapping(db, user_id, date_str, candidate, duration)
        if not conflicts:
            return {"date": date_str, "start_minutes": candidate, "duration_minutes": duration}
        candidate += 15
    return None


async def suggest_habit_slot(
    db: AsyncSession, user_id: str, habit: Habit, today: date
) -> dict[str, Any] | None:
    """The habit's own scheduled time, today, if nothing else occupies it. A
    habit already has a designated time of day (e.g. a wake-up routine at
    6am) — suggesting some unrelated evening slot for it doesn't make sense,
    unlike workout_gap which has no single row to anchor a "usual time" to.

    Deliberately doesn't reuse tools.py's _overlapping: that also checks
    habit_occurrences for the date, which would always find this exact habit
    occupying its own usual time and report a false conflict against itself —
    a habit is trivially "free" at its own designated slot; only a genuinely
    different event or habit colliding with it should count."""
    date_str = today.isoformat()
    start, duration = habit.start_minutes, habit.duration_minutes
    end = start + duration

    event_conflicts = (
        await db.scalars(
            select(Event).where(
                Event.user_id == user_id,
                Event.date == date_str,
                Event.start_minutes < end,
                Event.start_minutes + Event.duration_minutes > start,
            )
        )
    ).all()
    if event_conflicts:
        return None

    for occ in await habit_occurrences(db, user_id, date_str, date_str):
        if occ["id"] == habit.id:
            continue
        if occ["start_minutes"] < end and occ["start_minutes"] + occ["duration_minutes"] > start:
            return None

    return {"date": date_str, "start_minutes": start, "duration_minutes": duration}


async def suggest_slot_for_candidate(
    db: AsyncSession, user_id: str, candidate: NudgeCandidate, today: date, now_minutes: int | None
) -> dict[str, Any] | None:
    """Dispatches to the right slot strategy per nudge type."""
    if candidate.type == "habit_gap":
        habit = await db.get(Habit, candidate.subject_id)
        if habit is None or habit.user_id != user_id:
            return None
        return await suggest_habit_slot(db, user_id, habit, today)
    if candidate.type == "workout_gap":
        return await suggest_evening_slot(db, user_id, today, now_minutes)
    return None  # goal_pacing has no one-tap action, so no slot is needed


def build_action_phrase(
    candidate: NudgeCandidate, slot: dict[str, Any] | None, today: date
) -> str | None:
    if candidate.type == "goal_pacing":
        return None  # no one-tap action — the assistant shouldn't guess progress
    if slot is None:
        return f"Add {candidate.subject_title} to today's schedule"
    hh, mm = divmod(slot["start_minutes"], 60)
    period = "AM" if hh < 12 else "PM"
    hh12 = hh % 12 or 12
    time_str = f"{hh12}:{mm:02d} {period}"
    when = "today" if slot["date"] == today.isoformat() else "tomorrow"
    return f"Block {time_str} {when} for {candidate.subject_title}"
