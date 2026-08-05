"""Deterministic signal evaluation for the proactive nudge engine — no Gemini
here. Cheap enough to run on every app foreground; the router only spends a
Gemini call once this module actually returns a candidate."""

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Goal, Habit, Interest, WorkoutSession
from app.services.tools import (
    _overlapping,
    current_period_keys,
    goal_to_dict,
    habit_active_on,
    habit_occurrences,
)

NudgeType = Literal[
    "habit_gap",
    "workout_gap",
    "goal_pacing",
    "streak_milestone",
    "goal_ahead",
    "streak_risk_today",
    "habit_event_conflict",
    "workout_variety",
    "tasks_overdue",
    "habit_weekday_pattern",
    "interest_gap",
    "interest_not_started",
]

# Exact-value milestones only (not "streak >= N") — a streak that keeps
# growing day over day passes through each of these once and only once, so
# no persisted "already celebrated" state is needed to avoid repeating it.
_STREAK_MILESTONES = (7, 14, 30, 50, 100, 200, 365)

_WEEKDAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]  # index matches Habit.days_of_week's convention (0 = Sunday)

# Shared ranking, worst/best-first is broken by each type's own secondary key
# in candidate_priority below. Positive signals lead (a nudge engine that
# only ever raises problems stops feeling like encouragement); risk signals
# (still time to prevent something) beat plain deficits (already happened);
# pattern/imbalance signals are the softest, since nothing is acutely wrong.
_PRIORITY_ORDER: tuple[NudgeType, ...] = (
    "streak_milestone",
    "goal_ahead",
    "streak_risk_today",
    "habit_event_conflict",
    "workout_gap",
    "habit_gap",
    "interest_gap",
    "goal_pacing",
    "habit_weekday_pattern",
    "tasks_overdue",
    "workout_variety",
    "interest_not_started",
)


@dataclass
class NudgeCandidate:
    type: NudgeType
    subject_id: str
    subject_title: str
    metric: dict[str, Any] = field(default_factory=dict)


def candidate_priority(c: NudgeCandidate) -> tuple[int, float]:
    """Shared ranking used both by the live in-app check (one winner) and the
    coach's multi-window planner (several winners, one per window) — a single
    source of truth so the two surfaces never disagree about what matters
    most on a given day."""
    rank = _PRIORITY_ORDER.index(c.type)
    secondary = {
        "streak_milestone": -c.metric.get("streak", 0),
        "goal_ahead": -c.metric.get("lead", 1 - c.metric.get("elapsed", 0)),
        "streak_risk_today": -c.metric.get("streak", 0),
        "workout_gap": -c.metric.get("gap_days", 0),
        "habit_gap": -c.metric.get("miss_streak", 0),
        "interest_gap": -c.metric.get("gap_days", 0),
        "goal_pacing": -c.metric.get("margin", 0),
        "habit_weekday_pattern": -c.metric.get("skip_rate", 0),
        "tasks_overdue": -c.metric.get("count", 0),
        "interest_not_started": -c.metric.get("days_since_added", 0),
    }.get(c.type, 0.0)
    return (rank, secondary)


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
    return habit_active_on(habit, d)


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


def _habit_hit_streak(habit: Habit, today: date) -> int:
    """Consecutive completed active days, mirroring the frontend's
    getHabitStreak: an unfinished "today" doesn't zero out an otherwise
    intact streak — counting starts from yesterday until today is done."""
    completed = set(habit.completed_dates or [])
    cursor = today
    if _is_habit_active(habit, cursor) and cursor.isoformat() not in completed:
        cursor -= timedelta(days=1)
    streak = 0
    for _ in range(3650):
        if _is_habit_active(habit, cursor):
            if cursor.isoformat() in completed:
                streak += 1
            else:
                break
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


async def _last_completed_interest_date(db: AsyncSession, user_id: str, title: str) -> str | None:
    """Most recent date a completed Event's title matches this interest,
    case-insensitively — deliberately not a linked-id column (like
    workout_session_id): any completed event titled "Reading", whether made
    via this nudge's own one-tap action, through chat, or typed by hand on
    the Schedule tab, counts. Mirrors how the chat assistant already resolves
    events by title rather than requiring an explicit link."""
    return await db.scalar(
        select(Event.date)
        .where(
            Event.user_id == user_id,
            func.lower(Event.title) == title.lower(),
            Event.completed.is_(True),
        )
        .order_by(Event.date.desc())
        .limit(1)
    )


async def interest_gap_candidates(
    db: AsyncSession, user_id: str, today: date
) -> list[NudgeCandidate]:
    interests = (await db.scalars(select(Interest).where(Interest.user_id == user_id))).all()
    out = []
    for i in interests:
        last = await _last_completed_interest_date(db, user_id, i.title)
        if last is None:
            continue  # never done at all — that's interest_not_started's job, not a gap
        gap_days = (today - date.fromisoformat(last)).days
        if gap_days >= 4:
            out.append(
                NudgeCandidate(
                    type="interest_gap",
                    subject_id=i.id,
                    subject_title=i.title,
                    metric={"gap_days": gap_days},
                )
            )
    return out


async def interest_not_started_candidates(
    db: AsyncSession, user_id: str, today: date
) -> list[NudgeCandidate]:
    interests = (await db.scalars(select(Interest).where(Interest.user_id == user_id))).all()
    out = []
    for i in interests:
        added = date.fromtimestamp(i.created_at / 1000) if i.created_at else today
        days_since_added = (today - added).days
        if days_since_added < 2:
            continue  # grace period — don't nag the moment it's added
        if await _last_completed_interest_date(db, user_id, i.title) is not None:
            continue  # already done at least once — that's interest_gap's job, not this
        out.append(
            NudgeCandidate(
                type="interest_not_started",
                subject_id=i.id,
                subject_title=i.title,
                metric={"days_since_added": days_since_added},
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
        if info["mode"] in ("manual", "linked", "milestones") and info["total"] > 0:
            progress_fraction = info["fraction"]
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


async def streak_milestone_candidates(
    db: AsyncSession, user_id: str, today: date
) -> list[NudgeCandidate]:
    habits = (await db.scalars(select(Habit).where(Habit.user_id == user_id))).all()
    out = []
    for h in habits:
        streak = _habit_hit_streak(h, today)
        if streak in _STREAK_MILESTONES:
            out.append(
                NudgeCandidate(
                    type="streak_milestone",
                    subject_id=h.id,
                    subject_title=h.title,
                    metric={"streak": streak},
                )
            )
    return out


async def goal_ahead_candidates(
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
        if info["mode"] not in ("manual", "linked", "milestones") or info["total"] <= 0:
            continue
        progress_fraction = info["fraction"]
        if info["done"]:
            # Finished with real time to spare — always worth celebrating.
            if elapsed <= 0.7:
                out.append(
                    NudgeCandidate(
                        type="goal_ahead",
                        subject_id=g.id,
                        subject_title=g.title,
                        metric={"elapsed": elapsed, "done_early": True},
                    )
                )
            continue
        lead = progress_fraction - elapsed
        if elapsed >= 0.15 and lead >= 0.25:
            out.append(
                NudgeCandidate(
                    type="goal_ahead",
                    subject_id=g.id,
                    subject_title=g.title,
                    metric={"elapsed": elapsed, "progress_fraction": progress_fraction, "lead": lead},
                )
            )
    return out


async def streak_risk_today_candidates(
    db: AsyncSession, user_id: str, today: date, now_minutes: int | None
) -> list[NudgeCandidate]:
    """Catches a long streak BEFORE it breaks, not after: today is active,
    still not marked done, and the habit's own window has already passed.
    habit_gap only ever fires on a miss that's already happened — this is
    the same signal one day earlier, while there's still time to act."""
    if now_minutes is None:
        return []
    habits = (await db.scalars(select(Habit).where(Habit.user_id == user_id))).all()
    out = []
    for h in habits:
        if not habit_active_on(h, today):
            continue
        if today.isoformat() in (h.completed_dates or []):
            continue
        if now_minutes < h.start_minutes + h.duration_minutes:
            continue  # today's window hasn't passed yet — not at risk yet
        streak = _habit_hit_streak(h, today)
        if streak >= 7:
            out.append(
                NudgeCandidate(
                    type="streak_risk_today",
                    subject_id=h.id,
                    subject_title=h.title,
                    metric={"streak": streak},
                )
            )
    return out


async def habit_event_conflict_candidates(
    db: AsyncSession, user_id: str, today: date
) -> list[NudgeCandidate]:
    """A one-off event now overlapping a recurring habit's usual slot — the
    event is the flexible side (the habit is the standing commitment), so
    the subject here is the event that would move, not the habit."""
    date_str = today.isoformat()
    occs = await habit_occurrences(db, user_id, date_str, date_str)
    if not occs:
        return []
    events = (
        await db.scalars(select(Event).where(Event.user_id == user_id, Event.date == date_str))
    ).all()
    out = []
    flagged: set[str] = set()
    for occ in occs:
        occ_end = occ["start_minutes"] + occ["duration_minutes"]
        for e in events:
            if e.id in flagged:
                continue
            if e.start_minutes < occ_end and e.start_minutes + e.duration_minutes > occ["start_minutes"]:
                out.append(
                    NudgeCandidate(
                        type="habit_event_conflict",
                        subject_id=e.id,
                        subject_title=e.title,
                        metric={
                            "habit_title": occ["title"],
                            "habit_start_minutes": occ["start_minutes"],
                            "event_duration": e.duration_minutes,
                        },
                    )
                )
                flagged.add(e.id)
    return out


async def workout_variety_candidate(
    db: AsyncSession, user_id: str, today: date
) -> NudgeCandidate | None:
    """The last 4 completed workout-linked events were all the same
    WorkoutSession.type — an imbalance, not a deficit (workout_gap already
    covers "not working out at all")."""
    events = (
        await db.scalars(
            select(Event)
            .where(
                Event.user_id == user_id,
                Event.workout_session_id.is_not(None),
                Event.completed.is_(True),
            )
            .order_by(Event.date.desc())
            .limit(4)
        )
    ).all()
    if len(events) < 4:
        return None
    session_ids = [e.workout_session_id for e in events]
    sessions = (
        await db.scalars(select(WorkoutSession).where(WorkoutSession.id.in_(session_ids)))
    ).all()
    if len(sessions) < 4:
        return None
    types = {s.type for s in sessions}
    if len(types) != 1:
        return None
    return NudgeCandidate(
        type="workout_variety",
        subject_id="workout_variety",
        subject_title="your workouts",
        metric={"repeated_type": types.pop(), "count": len(events)},
    )


async def tasks_overdue_candidate(
    db: AsyncSession, user_id: str, today: date
) -> NudgeCandidate | None:
    """Events scheduled before today that never got marked done — Sunsama's
    rollover signal. A threshold of 3 keeps this from firing on the normal
    background noise of a couple of stray unfinished tasks."""
    count = await db.scalar(
        select(func.count())
        .select_from(Event)
        .where(
            Event.user_id == user_id,
            Event.date < today.isoformat(),
            Event.completed.is_(False),
        )
    )
    if not count or count < 3:
        return None
    return NudgeCandidate(
        type="tasks_overdue",
        subject_id="tasks_overdue",
        subject_title="overdue tasks",
        metric={"count": count},
    )


async def habit_weekday_pattern_candidates(
    db: AsyncSession, user_id: str, today: date
) -> list[NudgeCandidate]:
    """A habit that's fine most days but reliably skipped on one specific
    weekday is a scheduling mismatch, not a discipline problem — flag the
    day, not the habit. Only meaningful for weekly habits spanning 2+
    weekdays; a "skip" (explicitly in skipped_dates) doesn't count against
    the day the way an unmarked miss does."""
    habits = (await db.scalars(select(Habit).where(Habit.user_id == user_id))).all()
    out = []
    for h in habits:
        active_days = h.days_of_week or []
        if h.freq != "weekly" or len(active_days) < 2:
            continue
        completed = set(h.completed_dates or [])
        skipped = set(h.skipped_dates or [])
        buckets: dict[int, list[bool]] = {d: [] for d in active_days}
        cursor = today - timedelta(days=1)
        oldest = today - timedelta(days=84)  # 12-week lookback, bounded
        while cursor >= oldest:
            if habit_active_on(h, cursor):
                wd = (cursor.weekday() + 1) % 7  # match days_of_week's Sun=0 convention
                date_str = cursor.isoformat()
                if date_str in completed:
                    buckets[wd].append(True)
                elif date_str not in skipped:
                    buckets[wd].append(False)
            cursor -= timedelta(days=1)
        rates = {wd: 1 - sum(hits) / len(hits) for wd, hits in buckets.items() if len(hits) >= 3}
        if len(rates) < 2:
            continue  # not enough history on 2+ distinct weekdays to compare
        worst_wd = max(rates, key=rates.get)
        worst_rate = rates[worst_wd]
        others = [r for wd, r in rates.items() if wd != worst_wd]
        if worst_rate >= 0.7 and min(others) <= worst_rate - 0.4:
            out.append(
                NudgeCandidate(
                    type="habit_weekday_pattern",
                    subject_id=h.id,
                    subject_title=h.title,
                    metric={
                        "weekday_name": _WEEKDAY_NAMES[worst_wd],
                        "skip_rate": worst_rate,
                        "new_days_of_week": [d for d in active_days if d != worst_wd],
                    },
                )
            )
    return out


async def all_candidates(
    db: AsyncSession, user_id: str, today: date, now_minutes: int | None = None
) -> list[NudgeCandidate]:
    """Every currently-true signal, unranked and unfiltered by exclusions —
    shared by the live in-app check (evaluate, one winner) and the coach's
    multi-window planner (several winners, one per window), so both surfaces
    draw from one pool instead of drifting apart."""
    out: list[NudgeCandidate] = []
    workout = await workout_gap_candidate(db, user_id, today)
    if workout is not None:
        out.append(workout)
    out += await habit_gap_candidates(db, user_id, today)
    out += await interest_gap_candidates(db, user_id, today)
    out += await interest_not_started_candidates(db, user_id, today)
    out += await goal_pacing_candidates(db, user_id, today)
    out += await streak_milestone_candidates(db, user_id, today)
    out += await goal_ahead_candidates(db, user_id, today)
    out += await streak_risk_today_candidates(db, user_id, today, now_minutes)
    out += await habit_event_conflict_candidates(db, user_id, today)
    out += await habit_weekday_pattern_candidates(db, user_id, today)
    variety = await workout_variety_candidate(db, user_id, today)
    if variety is not None:
        out.append(variety)
    overdue = await tasks_overdue_candidate(db, user_id, today)
    if overdue is not None:
        out.append(overdue)
    return out


async def evaluate(
    db: AsyncSession, user_id: str, today: date, excluded: set[str], now_minutes: int | None = None
) -> NudgeCandidate | None:
    """The single best candidate right now, by candidate_priority. Excluded
    keys ("type:subject_id") are the client's own active dismissal
    cooldowns, so a suppressed candidate lets the next-best one surface."""
    candidates = [
        c
        for c in await all_candidates(db, user_id, today, now_minutes)
        if f"{c.type}:{c.subject_id}" not in excluded
    ]
    if not candidates:
        return None
    return min(candidates, key=candidate_priority)


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
    db: AsyncSession, user_id: str, habit: Habit, today: date, now_minutes: int | None = None
) -> dict[str, Any] | None:
    """The habit's own scheduled time, today, if nothing else occupies it. A
    habit already has a designated time of day (e.g. a wake-up routine at
    6am) — suggesting some unrelated evening slot for it doesn't make sense,
    unlike workout_gap which has no single row to anchor a "usual time" to.

    `now_minutes`, when given, is the time this suggestion will actually be
    read at (not necessarily when this function runs) — the coach plans
    checkpoints ahead of when they fire. If the habit's usual time has
    already passed by then, "today at 7am" is a stale, nonsensical thing to
    offer, so this returns None rather than guessing a different day/time
    (rolling to tomorrow would need to re-verify the habit is even active
    then, which isn't worth it for what's just a "nice to have" slot).

    Deliberately doesn't reuse tools.py's _overlapping: that also checks
    habit_occurrences for the date, which would always find this exact habit
    occupying its own usual time and report a false conflict against itself —
    a habit is trivially "free" at its own designated slot; only a genuinely
    different event or habit colliding with it should count."""
    start, duration = habit.start_minutes, habit.duration_minutes
    if now_minutes is not None and start < now_minutes:
        return None
    date_str = today.isoformat()
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


async def suggest_catchup_slot_today(
    db: AsyncSession, user_id: str, today: date, now_minutes: int | None, duration: int
) -> dict[str, Any] | None:
    """Remaining-today only, no tomorrow fallback — a same-day streak
    catch-up loses its entire point if pushed to tomorrow, so finding
    nothing left today should mean no action, not a rolled-over one."""
    if now_minutes is None:
        return None
    candidate = ((now_minutes // 15) + 1) * 15
    date_str = today.isoformat()
    while candidate + duration <= 24 * 60:
        conflicts = await _overlapping(db, user_id, date_str, candidate, duration)
        if not conflicts:
            return {"date": date_str, "start_minutes": candidate, "duration_minutes": duration}
        candidate += 15
    return None


async def suggest_free_slot_avoiding_conflicts(
    db: AsyncSession, user_id: str, date_str: str, duration: int, exclude_event_id: str
) -> dict[str, Any] | None:
    """First free slot on the given date, starting the daytime search at
    9:00 — used to relocate the flexible side of a habit/event conflict
    (see habit_event_conflict_candidates). exclude_event_id keeps the
    conflicting event from being reported as colliding with itself."""
    candidate = 9 * 60
    while candidate + duration <= 24 * 60:
        conflicts = await _overlapping(
            db, user_id, date_str, candidate, duration, exclude_id=exclude_event_id
        )
        if not conflicts:
            return {"date": date_str, "start_minutes": candidate, "duration_minutes": duration}
        candidate += 15
    return None


async def suggest_slot_for_candidate(
    db: AsyncSession, user_id: str, candidate: NudgeCandidate, today: date, now_minutes: int | None
) -> dict[str, Any] | None:
    """Dispatches to the right slot strategy per nudge type."""
    if candidate.type == "habit_gap":
        habit = await db.get(Habit, candidate.subject_id)
        if habit is None or habit.user_id != user_id:
            return None
        return await suggest_habit_slot(db, user_id, habit, today, now_minutes)
    if candidate.type in ("workout_gap", "interest_gap", "interest_not_started"):
        return await suggest_evening_slot(db, user_id, today, now_minutes)
    if candidate.type == "streak_risk_today":
        habit = await db.get(Habit, candidate.subject_id)
        if habit is None or habit.user_id != user_id:
            return None
        return await suggest_catchup_slot_today(db, user_id, today, now_minutes, habit.duration_minutes)
    if candidate.type == "habit_event_conflict":
        return await suggest_free_slot_avoiding_conflicts(
            db, user_id, today.isoformat(), candidate.metric["event_duration"], candidate.subject_id
        )
    return None  # goal_pacing, habit_weekday_pattern, etc. have no slot-based action


def build_pending_action(
    candidate: NudgeCandidate, slot: dict[str, Any] | None, today: date
) -> dict[str, Any] | None:
    """The literal {tool, args} a "Yes" tap executes, computed deterministically
    from the candidate + slot this module already found — never guessed by
    the model. None means there's nothing safe to one-tap (celebratory or
    purely informational types, or a slot-needing type where no slot was
    found), in which case the UI falls back to build_action_phrase or a
    plain "View" action."""
    if candidate.type in (
        "workout_gap",
        "habit_gap",
        "streak_risk_today",
        "interest_gap",
        "interest_not_started",
    ):
        if slot is None:
            return None
        title = "Workout" if candidate.type == "workout_gap" else candidate.subject_title
        return {
            "tool": "create_event",
            "args": {
                "title": title,
                "date": slot["date"],
                "start_minutes": slot["start_minutes"],
                "duration_minutes": slot["duration_minutes"],
            },
        }
    if candidate.type == "habit_event_conflict":
        if slot is None:
            return None
        return {
            "tool": "move_event",
            "args": {
                "event_id": candidate.subject_id,
                "new_date": slot["date"],
                "new_start_minutes": slot["start_minutes"],
            },
        }
    if candidate.type == "habit_weekday_pattern":
        return {
            "tool": "update_habit",
            "args": {
                "habit_id": candidate.subject_id,
                "days_of_week": candidate.metric["new_days_of_week"],
            },
        }
    return None  # goal_pacing, streak_milestone, goal_ahead, workout_variety, tasks_overdue


def build_action_phrase(
    candidate: NudgeCandidate, slot: dict[str, Any] | None, today: date
) -> str | None:
    """Chat-opening follow-up for types with no single safe one-tap action —
    superseded by build_pending_action wherever that returns something, so
    this only ever needs to cover the genuinely open-ended cases left over:
    there's no one correct mutation, just a conversation worth starting."""
    if candidate.type == "tasks_overdue":
        return "Help me deal with my overdue tasks"
    if candidate.type == "workout_variety":
        return "Suggest a different kind of workout to mix things up"
    return None
