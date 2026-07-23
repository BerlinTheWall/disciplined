"""Scheduling tools exposed to Gemini: declarations + executors against the DB.

Times are minutes since midnight (e.g. 540 = 9:00 AM) to match the frontend's
Task model. Dates are ISO strings ("2026-07-05").
"""

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
        js_weekday = (day.weekday() + 1) % 7  # python Mon=0 -> frontend Sun=0
        for h in habits:
            if js_weekday in (h.days_of_week or []) and day_str not in (h.skipped_dates or []):
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
                f"{item_id} is a recurring habit — habits can't be changed through chat yet. "
                "Tell the user to edit it in the Habits tab."
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
