"""Scheduling tools exposed to Gemini: declarations + executors against the DB.

Times are minutes since midnight (e.g. 540 = 9:00 AM) to match the frontend's
Task model. Dates are ISO strings ("2026-07-05").
"""

import calendar
from datetime import date, timedelta
from typing import Any

from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Goal, Habit


def fmt_minutes(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def event_to_dict(e: Event) -> dict[str, Any]:
    return {
        "id": e.id,
        "kind": "event",
        "title": e.title,
        "date": e.date,
        "start": fmt_minutes(e.start_minutes),
        "start_minutes": e.start_minutes,
        "duration_minutes": e.duration_minutes,
        "completed": e.completed,
        "priority": e.priority,
    }


def habit_occurrence_to_dict(h: Habit, date_str: str) -> dict[str, Any]:
    return {
        "id": h.id,
        "kind": "habit",
        "title": h.title,
        "date": date_str,
        "start": fmt_minutes(h.start_minutes),
        "start_minutes": h.start_minutes,
        "duration_minutes": h.duration_minutes,
        "completed": date_str in (h.completed_dates or []),
    }


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _parse_anchor(anchor_date: str | None) -> date | None:
    """None on anything unparseable — a habit degrades to "doesn't fire"
    instead of taking down the whole system-prompt build (and therefore the
    entire chat feature for that user) on one malformed row."""
    if not anchor_date:
        return None
    try:
        return date.fromisoformat(anchor_date)
    except ValueError:
        return None


def habit_active_on(h: Habit, d: date) -> bool:
    """Single source of truth for "does this habit have an occurrence on d".
    Mirrored exactly by frontend/src/lib/habits.ts::isHabitActiveOnDate — keep
    both in sync if this changes.

    freq="weekly" + interval<=1 (or no anchor_date) is byte-for-byte the
    original weekday-only check, so every pre-existing habit (migrated with
    exactly that shape) behaves identically to before this was added."""
    if d.isoformat() in (h.skipped_dates or []):
        return False
    freq = h.freq or "weekly"
    interval = max(1, h.interval or 1)

    if freq == "monthly":
        anchor = _parse_anchor(h.anchor_date)
        if anchor is None:
            return False
        month_diff = (d.year - anchor.year) * 12 + (d.month - anchor.month)
        if month_diff < 0 or month_diff % interval != 0:
            return False
        target_day = min(anchor.day, calendar.monthrange(d.year, d.month)[1])
        return d.day == target_day

    js_weekday = (d.weekday() + 1) % 7  # python Mon=0 -> frontend Sun=0
    if js_weekday not in (h.days_of_week or []):
        return False
    if interval <= 1 or not h.anchor_date:
        return True
    anchor = _parse_anchor(h.anchor_date)
    if anchor is None:
        return True  # matches the "interval<=1 or no anchor_date" fallback above
    week_diff = (_monday_of(d) - _monday_of(anchor)).days // 7
    return week_diff >= 0 and week_diff % interval == 0


async def habit_occurrences(
    db: AsyncSession, user_id: str, start_date: str, end_date: str
) -> list[dict]:
    """Recurring habits expanded to concrete occurrences within the date range
    (inclusive). Habits use the frontend's weekday convention: 0 = Sunday."""
    habits = (await db.scalars(select(Habit).where(Habit.user_id == user_id))).all()
    if not habits:
        return []
    out: list[dict] = []
    day = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    while day <= end:
        day_str = day.isoformat()
        for h in habits:
            if habit_active_on(h, day):
                out.append(habit_occurrence_to_dict(h, day_str))
        day += timedelta(days=1)
    return out


async def goal_to_dict(db: AsyncSession, user_id: str, g: Goal) -> dict[str, Any]:
    """Resolve a goal's progress mode exactly like the frontend's goalProgress.ts:
    task-linked goals derive progress from their linked events' completion,
    manual goals from a numeric target, everything else is a plain done flag."""
    task_ids = g.task_ids or []
    if task_ids:
        linked = [
            e
            for e in (await db.scalars(select(Event).where(Event.id.in_(task_ids)))).all()
            if e.user_id == user_id
        ]
        completed = sum(1 for e in linked if e.completed)
        total = len(linked)
        mode, current = "tasks", completed
        done = g.done or (total > 0 and completed == total)
    elif g.target is not None and g.target > 0:
        mode, current, total = "manual", g.progress, g.target
        done = g.done or g.progress >= g.target
    else:
        mode, current, total, done = "check", 0, 0, g.done
    return {
        "id": g.id,
        "kind": "goal",
        "title": g.title,
        "period": g.period,
        "period_key": g.period_key,
        "mode": mode,
        "done": done,
        "current": current,
        "total": total,
        "priority": g.priority,
    }


def current_period_keys(today: date) -> dict[str, str]:
    """Mirrors frontend/src/lib/goalPeriods.ts::periodKeyFor for week/month/year.
    The three formats ("YYYY-MM-DD" Monday, "YYYY-MM", "YYYY") never collide
    textually, so callers can safely filter Goal.period_key with a single IN."""
    monday = today - timedelta(days=today.weekday())
    return {
        "week": monday.isoformat(),
        "month": f"{today.year:04d}-{today.month:02d}",
        "year": str(today.year),
    }


_MINUTES_DESC = "Minutes since midnight, e.g. 540 = 9:00 AM, 810 = 1:30 PM."
_DATE_DESC = 'ISO date string, e.g. "2026-07-05".'
# Spelled out day-by-day, not "0=Sunday..6=Saturday" — leaving the model to
# compute e.g. "Thursday is index 4" itself is exactly the kind of small
# arithmetic smaller models get wrong (confirmed: a "Thursday" request landed
# on Wednesday). Fully enumerating removes the arithmetic step entirely.
_WEEKDAY_DESC = (
    "Days it repeats on: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, "
    "5=Friday, 6=Saturday."
)

_WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


def habit_recurrence_label(h: Habit) -> str:
    """Short human-readable cadence, e.g. "daily", "every 2 weeks (Thu)",
    "every 6 months" — used so a habit is identifiable by its schedule even
    when it has no occurrence in the visible 7-day window (biweekly/monthly
    habits routinely skip a given week)."""
    freq = h.freq or "weekly"
    interval = max(1, h.interval or 1)
    if freq == "monthly":
        if interval == 1:
            return "monthly"
        if interval == 12:
            return "yearly"
        return f"every {interval} months"
    days = h.days_of_week or []
    base = "daily" if len(days) == 7 else "on " + ", ".join(_WEEKDAY_ABBR[d] for d in sorted(days))
    return base if interval <= 1 else f"every {interval} weeks ({base})"

FUNCTION_DECLARATIONS = [
    types.FunctionDeclaration(
        name="create_event",
        description=(
            "Create a new event on the user's schedule. Only title and date are required — "
            "omit start_minutes and/or duration_minutes and a sensible free slot is chosen "
            "automatically (the result tells you what was picked). Conflicts are checked "
            "automatically: if the slot is taken, nothing is created and the overlapping "
            "events are returned instead."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "title": types.Schema(type=types.Type.STRING, description="Event title."),
                "date": types.Schema(type=types.Type.STRING, description=_DATE_DESC),
                "start_minutes": types.Schema(
                    type=types.Type.INTEGER,
                    description=_MINUTES_DESC + " Omit to auto-pick a free slot.",
                ),
                "duration_minutes": types.Schema(
                    type=types.Type.INTEGER,
                    description="Duration in minutes. Omit to default to 60.",
                ),
                "allow_conflict": types.Schema(
                    type=types.Type.BOOLEAN,
                    description="Set true only when the user explicitly wants the event despite an overlap.",
                ),
                "priority": types.Schema(
                    type=types.Type.STRING,
                    enum=["low", "medium", "high"],
                    description="Importance of the event. Defaults to medium.",
                ),
                "icon": types.Schema(
                    type=types.Type.STRING,
                    enum=[
                        "alarm", "workout", "shower", "meal", "bike", "reading",
                        "coffee", "work", "health", "shopping", "default",
                    ],
                    description="Icon that best matches the event.",
                ),
            },
            required=["title", "date"],
        ),
    ),
    types.FunctionDeclaration(
        name="list_events",
        description="List the user's events, optionally filtered to a date range (inclusive).",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "start_date": types.Schema(type=types.Type.STRING, description=_DATE_DESC),
                "end_date": types.Schema(type=types.Type.STRING, description=_DATE_DESC),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="move_event",
        description=(
            "Move an existing event to a new date and/or start time. Conflicts are checked "
            "automatically: if the target slot is taken, nothing moves and the overlapping "
            "events are returned instead."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "event_id": types.Schema(type=types.Type.STRING, description="ID of the event to move."),
                "new_date": types.Schema(type=types.Type.STRING, description=_DATE_DESC),
                "new_start_minutes": types.Schema(type=types.Type.INTEGER, description=_MINUTES_DESC),
                "allow_conflict": types.Schema(
                    type=types.Type.BOOLEAN,
                    description="Set true only when the user explicitly wants the move despite an overlap.",
                ),
            },
            required=["event_id"],
        ),
    ),
    types.FunctionDeclaration(
        name="delete_event",
        description="Delete an event from the schedule.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "event_id": types.Schema(type=types.Type.STRING, description="ID of the event to delete."),
            },
            required=["event_id"],
        ),
    ),
    types.FunctionDeclaration(
        name="check_conflicts",
        description="Check whether a time slot overlaps existing events on a date. Use before creating or moving events.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "date": types.Schema(type=types.Type.STRING, description=_DATE_DESC),
                "start_minutes": types.Schema(type=types.Type.INTEGER, description=_MINUTES_DESC),
                "duration_minutes": types.Schema(type=types.Type.INTEGER, description="Duration in minutes."),
                "exclude_event_id": types.Schema(
                    type=types.Type.STRING,
                    description="Event ID to ignore (when checking a move of that event).",
                ),
            },
            required=["date", "start_minutes", "duration_minutes"],
        ),
    ),
    types.FunctionDeclaration(
        name="swap_events",
        description="Swap the date and start time of two events.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "event_id_a": types.Schema(type=types.Type.STRING, description="First event ID."),
                "event_id_b": types.Schema(type=types.Type.STRING, description="Second event ID."),
            },
            required=["event_id_a", "event_id_b"],
        ),
    ),
    types.FunctionDeclaration(
        name="set_event_completion",
        description="Mark a one-time event done or not done.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "event_id": types.Schema(type=types.Type.STRING, description="ID of the event."),
                "done": types.Schema(type=types.Type.BOOLEAN, description="True to mark done, false to un-mark."),
            },
            required=["event_id", "done"],
        ),
    ),
    types.FunctionDeclaration(
        name="set_habit_completion",
        description="Mark a recurring habit's occurrence on a specific date done or not done.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "habit_id": types.Schema(type=types.Type.STRING, description="ID of the habit."),
                "date": types.Schema(type=types.Type.STRING, description=_DATE_DESC),
                "done": types.Schema(type=types.Type.BOOLEAN, description="True to mark done, false to un-mark."),
            },
            required=["habit_id", "date", "done"],
        ),
    ),
    types.FunctionDeclaration(
        name="list_goals",
        description="List the user's goals, optionally filtered to a period. Use this for goals outside the current week/month/year shown in context.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "period": types.Schema(
                    type=types.Type.STRING,
                    enum=["week", "month", "year"],
                    description="Restrict to this period type.",
                ),
                "period_key": types.Schema(
                    type=types.Type.STRING,
                    description='The specific period instance: week is the Monday\'s ISO date, month is "YYYY-MM", year is "YYYY".',
                ),
            },
        ),
    ),
    types.FunctionDeclaration(
        name="add_goal_progress",
        description=(
            "Add (or subtract, with a negative delta) to a manual-mode goal's progress. "
            "Only works on goals with a numeric target and no linked tasks — check the goal's "
            "mode first (from context or list_goals); for task-linked goals, complete the "
            "linked task(s) instead, and for check-mode goals use set_goal_done."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "goal_id": types.Schema(type=types.Type.STRING, description="ID of the goal."),
                "delta": types.Schema(
                    type=types.Type.INTEGER,
                    description="Amount to add to progress; negative to subtract.",
                ),
            },
            required=["goal_id", "delta"],
        ),
    ),
    types.FunctionDeclaration(
        name="set_goal_done",
        description="Mark a goal done or not done directly, regardless of its progress mode.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "goal_id": types.Schema(type=types.Type.STRING, description="ID of the goal."),
                "done": types.Schema(type=types.Type.BOOLEAN, description="True to mark done, false to un-mark."),
            },
            required=["goal_id", "done"],
        ),
    ),
    types.FunctionDeclaration(
        name="create_habit",
        description=(
            "Create a new recurring habit. Only title is required — omit days_of_week for "
            "every day, start_minutes/duration_minutes for 9:00 AM / 30 minutes (matching the "
            "app's own new-habit defaults). No conflict checking, same as creating one in the "
            "Habits tab."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "title": types.Schema(type=types.Type.STRING, description="Habit title."),
                "freq": types.Schema(
                    type=types.Type.STRING,
                    enum=["weekly", "monthly"],
                    description='How it repeats. Omit for "weekly" (the default).',
                ),
                "interval": types.Schema(
                    type=types.Type.INTEGER,
                    description=(
                        "Repeat every N weeks (freq=weekly) or N months (freq=monthly). "
                        "interval=2 + freq=weekly = every other week. interval=6 + freq=monthly "
                        "= every 6 months. interval=12 + freq=monthly = once a year. Omit for 1."
                    ),
                ),
                "anchor_date": types.Schema(
                    type=types.Type.STRING,
                    description=(
                        _DATE_DESC + " The date this recurrence cycle counts from (its first "
                        "occurrence) — resolve it yourself like any other date. Only matters "
                        "when interval > 1 or freq is monthly; omit to default to today."
                    ),
                ),
                "days_of_week": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.INTEGER),
                    description=(
                        _WEEKDAY_DESC + " Only used when freq is weekly. Omit for every day. "
                        "Ignored when freq is monthly."
                    ),
                ),
                "start_minutes": types.Schema(
                    type=types.Type.INTEGER,
                    description=_MINUTES_DESC + " Omit to default to 9:00 AM.",
                ),
                "duration_minutes": types.Schema(
                    type=types.Type.INTEGER,
                    description="Duration in minutes. Omit to default to 30.",
                ),
                "icon": types.Schema(
                    type=types.Type.STRING,
                    enum=[
                        "alarm", "workout", "shower", "meal", "bike", "reading",
                        "coffee", "work", "health", "shopping", "default",
                    ],
                    description="Icon that best matches the habit.",
                ),
            },
            required=["title"],
        ),
    ),
    types.FunctionDeclaration(
        name="update_habit",
        description=(
            "Change an existing habit's title, days, time, duration, icon, or how often it "
            "repeats. Omit any field you're not changing — only the given ones are updated."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "habit_id": types.Schema(type=types.Type.STRING, description="ID of the habit."),
                "title": types.Schema(type=types.Type.STRING, description="New title."),
                "freq": types.Schema(
                    type=types.Type.STRING,
                    enum=["weekly", "monthly"],
                    description="New repeat unit.",
                ),
                "interval": types.Schema(
                    type=types.Type.INTEGER,
                    description=(
                        "New repeat interval — every N weeks (freq=weekly) or N months "
                        "(freq=monthly). See create_habit's description for examples."
                    ),
                ),
                "anchor_date": types.Schema(
                    type=types.Type.STRING,
                    description=_DATE_DESC + " New date the recurrence cycle counts from.",
                ),
                "days_of_week": types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(type=types.Type.INTEGER),
                    description="New days it repeats on. " + _WEEKDAY_DESC,
                ),
                "start_minutes": types.Schema(type=types.Type.INTEGER, description=_MINUTES_DESC),
                "duration_minutes": types.Schema(
                    type=types.Type.INTEGER, description="New duration in minutes."
                ),
                "icon": types.Schema(
                    type=types.Type.STRING,
                    enum=[
                        "alarm", "workout", "shower", "meal", "bike", "reading",
                        "coffee", "work", "health", "shopping", "default",
                    ],
                    description="New icon.",
                ),
            },
            required=["habit_id"],
        ),
    ),
    types.FunctionDeclaration(
        name="list_habits",
        description=(
            "List every habit with its id and how often it repeats. Every habit is already "
            "listed in the system prompt above, so you shouldn't normally need this — but use "
            "it if you're about to act on a habit and aren't confident of its id (e.g. it has "
            "no occurrence in the 7-day schedule this week). Never guess a different habit's id "
            "and never ask the user for a raw id — call this instead."
        ),
        parameters=types.Schema(type=types.Type.OBJECT, properties={}),
    ),
]

# Tools that change data — the client uses this to know when to refetch.
MUTATING_TOOLS = {
    "create_event",
    "move_event",
    "delete_event",
    "swap_events",
    "set_event_completion",
    "set_habit_completion",
    "add_goal_progress",
    "set_goal_done",
    "create_habit",
    "update_habit",
}


async def _get_event(db: AsyncSession, user_id: str, event_id: str) -> Event | None:
    event = await db.get(Event, event_id)
    if event is None or event.user_id != user_id:
        return None
    return event


async def _get_habit(db: AsyncSession, user_id: str, habit_id: str) -> Habit | None:
    habit = await db.get(Habit, habit_id)
    if habit is None or habit.user_id != user_id:
        return None
    return habit


async def _get_goal(db: AsyncSession, user_id: str, goal_id: str) -> Goal | None:
    goal = await db.get(Goal, goal_id)
    if goal is None or goal.user_id != user_id:
        return None
    return goal


async def _missing_event_error(db: AsyncSession, user_id: str, item_id: str) -> dict:
    habit = await db.get(Habit, item_id)
    if habit is not None and habit.user_id == user_id:
        return {
            "error": (
                f"{item_id} is a recurring habit, not an event — use set_habit_completion or "
                "update_habit for it instead."
            )
        }
    return {"error": f"No event with id {item_id}"}


async def _overlapping(
    db: AsyncSession,
    user_id: str,
    date_str: str,
    start: int,
    duration: int,
    exclude_id: str | None = None,
) -> list[dict]:
    """Events and habit occurrences that clash with the slot, as dicts."""
    query = select(Event).where(
        Event.user_id == user_id,
        Event.date == date_str,
        Event.start_minutes < start + duration,
        Event.start_minutes + Event.duration_minutes > start,
    )
    if exclude_id:
        query = query.where(Event.id != exclude_id)
    clashes = [event_to_dict(e) for e in (await db.scalars(query)).all()]
    for occ in await habit_occurrences(db, user_id, date_str, date_str):
        if occ["start_minutes"] < start + duration and (
            occ["start_minutes"] + occ["duration_minutes"] > start
        ):
            clashes.append(occ)
    return clashes


async def _find_free_slot(db: AsyncSession, user_id: str, date_str: str, duration: int) -> int:
    """First gap of `duration` minutes on the date, scanning from 9:00; falls
    back to right after the last event when the daytime is packed."""
    events = (
        await db.scalars(
            select(Event)
            .where(Event.user_id == user_id, Event.date == date_str)
            .order_by(Event.start_minutes)
        )
    ).all()
    candidate = 9 * 60
    for e in events:
        if candidate + duration <= e.start_minutes:
            break
        candidate = max(candidate, e.start_minutes + e.duration_minutes)
    return min(candidate, 24 * 60 - duration)


async def _create_event(db: AsyncSession, user_id: str, args: dict) -> dict:
    duration = int(args.get("duration_minutes") or 60)
    start = args.get("start_minutes")
    if start is not None:
        start = int(start)
    else:
        start = await _find_free_slot(db, user_id, args["date"], duration)
    if not args.get("allow_conflict"):
        conflicts = await _overlapping(db, user_id, args["date"], start, duration)
        if conflicts:
            return {
                "error": "slot_taken",
                "message": "Not created — the slot overlaps existing items. Suggest an alternative, or retry with allow_conflict=true if the user insists.",
                "conflicts": conflicts,
            }
    event = Event(
        title=args["title"],
        date=args["date"],
        start_minutes=start,
        duration_minutes=duration,
        priority=args.get("priority"),
        icon=args.get("icon", "default"),
        user_id=user_id,
    )
    db.add(event)
    await db.commit()
    return {"created": event_to_dict(event)}


async def _list_events(db: AsyncSession, user_id: str, args: dict) -> dict:
    query = select(Event).where(Event.user_id == user_id)
    if args.get("start_date"):
        query = query.where(Event.date >= args["start_date"])
    if args.get("end_date"):
        query = query.where(Event.date <= args["end_date"])
    query = query.order_by(Event.date, Event.start_minutes)
    events = (await db.scalars(query)).all()
    items = [event_to_dict(e) for e in events]
    # Habits repeat, so they need a concrete range to expand over; without one,
    # show the week ahead.
    start = args.get("start_date") or date.today().isoformat()
    end = args.get("end_date") or (date.fromisoformat(start) + timedelta(days=6)).isoformat()
    items += await habit_occurrences(db, user_id, start, end)
    items.sort(key=lambda i: (i["date"], i["start_minutes"]))
    return {"events": items}


async def _move_event(db: AsyncSession, user_id: str, args: dict) -> dict:
    event = await _get_event(db, user_id, args["event_id"])
    if event is None:
        return await _missing_event_error(db, user_id, args["event_id"])
    new_date = args.get("new_date") or event.date
    new_start = (
        int(args["new_start_minutes"])
        if args.get("new_start_minutes") is not None
        else event.start_minutes
    )
    if not args.get("allow_conflict"):
        conflicts = await _overlapping(
            db, user_id, new_date, new_start, event.duration_minutes, exclude_id=event.id
        )
        if conflicts:
            return {
                "error": "slot_taken",
                "message": "Not moved — the target slot overlaps existing items. Suggest an alternative, or retry with allow_conflict=true if the user insists.",
                "conflicts": conflicts,
            }
    event.date = new_date
    event.start_minutes = new_start
    await db.commit()
    return {"moved": event_to_dict(event)}


async def _delete_event(db: AsyncSession, user_id: str, args: dict) -> dict:
    event = await _get_event(db, user_id, args["event_id"])
    if event is None:
        return await _missing_event_error(db, user_id, args["event_id"])
    deleted = event_to_dict(event)
    await db.delete(event)
    await db.commit()
    return {"deleted": deleted}


async def _check_conflicts(db: AsyncSession, user_id: str, args: dict) -> dict:
    conflicts = await _overlapping(
        db,
        user_id,
        args["date"],
        int(args["start_minutes"]),
        int(args["duration_minutes"]),
        exclude_id=args.get("exclude_event_id"),
    )
    return {
        "has_conflicts": len(conflicts) > 0,
        "conflicts": conflicts,
    }


async def _swap_events(db: AsyncSession, user_id: str, args: dict) -> dict:
    a = await _get_event(db, user_id, args["event_id_a"])
    b = await _get_event(db, user_id, args["event_id_b"])
    if a is None or b is None:
        missing = args["event_id_a"] if a is None else args["event_id_b"]
        return await _missing_event_error(db, user_id, missing)
    a.date, b.date = b.date, a.date
    a.start_minutes, b.start_minutes = b.start_minutes, a.start_minutes
    await db.commit()
    return {"swapped": [event_to_dict(a), event_to_dict(b)]}


async def _set_event_completion(db: AsyncSession, user_id: str, args: dict) -> dict:
    event = await _get_event(db, user_id, args["event_id"])
    if event is None:
        return await _missing_event_error(db, user_id, args["event_id"])
    event.completed = bool(args["done"])
    await db.commit()
    return {"event": event_to_dict(event)}


async def _set_habit_completion(db: AsyncSession, user_id: str, args: dict) -> dict:
    habit = await _get_habit(db, user_id, args["habit_id"])
    if habit is None:
        return {"error": f"No habit with id {args['habit_id']}"}
    date_str = args["date"]
    current = habit.completed_dates or []
    if args["done"]:
        new_dates = current if date_str in current else [*current, date_str]
    else:
        new_dates = [d for d in current if d != date_str]
    habit.completed_dates = new_dates  # reassign — JSONB mutation isn't tracked in-place
    await db.commit()
    return {"habit": habit_occurrence_to_dict(habit, date_str)}


async def _list_goals(db: AsyncSession, user_id: str, args: dict) -> dict:
    query = select(Goal).where(Goal.user_id == user_id)
    if args.get("period"):
        query = query.where(Goal.period == args["period"])
    if args.get("period_key"):
        query = query.where(Goal.period_key == args["period_key"])
    query = query.order_by(Goal.period, Goal.order)
    goals = (await db.scalars(query)).all()
    return {"goals": [await goal_to_dict(db, user_id, g) for g in goals]}


async def _add_goal_progress(db: AsyncSession, user_id: str, args: dict) -> dict:
    goal = await _get_goal(db, user_id, args["goal_id"])
    if goal is None:
        return {"error": f"No goal with id {args['goal_id']}"}
    info = await goal_to_dict(db, user_id, goal)
    if info["mode"] == "tasks":
        return {
            "error": "goal_is_task_linked",
            "message": (
                "This goal's progress comes from finishing its linked tasks, not something "
                "settable directly. Use set_event_completion on the linked task(s), or tell "
                "the user to complete them in the app. If they explicitly want it marked done "
                "regardless, use set_goal_done instead."
            ),
        }
    if info["mode"] == "check":
        return {
            "error": "goal_has_no_target",
            "message": "This goal has no numeric target — use set_goal_done to mark it done instead.",
        }
    goal.progress = max(0, min(goal.target, goal.progress + int(args["delta"])))
    goal.done = goal.progress >= goal.target
    await db.commit()
    return {"goal": await goal_to_dict(db, user_id, goal)}


async def _set_goal_done(db: AsyncSession, user_id: str, args: dict) -> dict:
    goal = await _get_goal(db, user_id, args["goal_id"])
    if goal is None:
        return {"error": f"No goal with id {args['goal_id']}"}
    goal.done = bool(args["done"])
    await db.commit()
    return {"goal": await goal_to_dict(db, user_id, goal)}


async def _create_habit(db: AsyncSession, user_id: str, args: dict) -> dict:
    freq = args.get("freq") or "weekly"
    interval = int(args.get("interval") or 1)
    if freq == "monthly":
        interval = min(interval, 12)  # keeps streak/rate walk-backs within their guard
    anchor_date = args.get("anchor_date")
    if (interval > 1 or freq == "monthly") and not anchor_date:
        anchor_date = date.today().isoformat()
    habit = Habit(
        title=args["title"],
        start_minutes=int(args.get("start_minutes") or 9 * 60),
        duration_minutes=int(args.get("duration_minutes") or 30),
        icon=args.get("icon", "default"),
        freq=freq,
        interval=interval,
        anchor_date=anchor_date,
        days_of_week=args.get("days_of_week") or ([] if freq == "monthly" else [0, 1, 2, 3, 4, 5, 6]),
        user_id=user_id,
    )
    db.add(habit)
    await db.commit()
    return {"created": _habit_summary(habit)}


def _habit_summary(habit: Habit) -> dict[str, Any]:
    return {
        "id": habit.id,
        "kind": "habit",
        "title": habit.title,
        "start": fmt_minutes(habit.start_minutes),
        "start_minutes": habit.start_minutes,
        "duration_minutes": habit.duration_minutes,
        "days_of_week": habit.days_of_week,
        "freq": habit.freq,
        "interval": habit.interval,
        "anchor_date": habit.anchor_date,
    }


async def _update_habit(db: AsyncSession, user_id: str, args: dict) -> dict:
    habit = await _get_habit(db, user_id, args["habit_id"])
    if habit is None:
        return {"error": f"No habit with id {args['habit_id']}"}
    if "title" in args and args["title"] is not None:
        habit.title = args["title"]
    if "days_of_week" in args and args["days_of_week"] is not None:
        habit.days_of_week = args["days_of_week"]
    if "start_minutes" in args and args["start_minutes"] is not None:
        habit.start_minutes = int(args["start_minutes"])
    if "duration_minutes" in args and args["duration_minutes"] is not None:
        habit.duration_minutes = int(args["duration_minutes"])
    if "icon" in args and args["icon"] is not None:
        habit.icon = args["icon"]
    if "freq" in args and args["freq"] is not None:
        habit.freq = args["freq"]
    if "interval" in args and args["interval"] is not None:
        habit.interval = int(args["interval"])
    if "anchor_date" in args and args["anchor_date"] is not None:
        habit.anchor_date = args["anchor_date"]
    if habit.freq == "monthly":
        habit.interval = min(habit.interval, 12)
    # Auto-heal: an update that pushes freq/interval into "needs an anchor"
    # territory on a row that never had one (every pre-existing habit).
    if (habit.freq == "monthly" or habit.interval > 1) and not habit.anchor_date:
        habit.anchor_date = date.today().isoformat()
    await db.commit()
    return {"updated": _habit_summary(habit)}


async def _list_habits(db: AsyncSession, user_id: str, args: dict) -> dict:
    habits = (
        await db.scalars(select(Habit).where(Habit.user_id == user_id).order_by(Habit.start_minutes))
    ).all()
    return {
        "habits": [{**_habit_summary(h), "repeats": habit_recurrence_label(h)} for h in habits]
    }


_EXECUTORS = {
    "create_event": _create_event,
    "list_events": _list_events,
    "move_event": _move_event,
    "delete_event": _delete_event,
    "check_conflicts": _check_conflicts,
    "swap_events": _swap_events,
    "set_event_completion": _set_event_completion,
    "set_habit_completion": _set_habit_completion,
    "list_goals": _list_goals,
    "add_goal_progress": _add_goal_progress,
    "set_goal_done": _set_goal_done,
    "create_habit": _create_habit,
    "update_habit": _update_habit,
    "list_habits": _list_habits,
}


async def execute_tool(db: AsyncSession, user_id: str, name: str, args: dict) -> dict:
    executor = _EXECUTORS.get(name)
    if executor is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return await executor(db, user_id, args)
    except Exception as exc:  # surface failures to Gemini instead of crashing the turn
        await db.rollback()
        return {"error": f"{type(exc).__name__}: {exc}"}
