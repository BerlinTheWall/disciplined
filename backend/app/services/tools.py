"""Scheduling tools exposed to Gemini: declarations + executors against the DB.

Times are minutes since midnight (e.g. 540 = 9:00 AM) to match the frontend's
Task model. Dates are ISO strings ("2026-07-05").
"""

from typing import Any

from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event


def fmt_minutes(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def event_to_dict(e: Event) -> dict[str, Any]:
    return {
        "id": e.id,
        "title": e.title,
        "date": e.date,
        "start": fmt_minutes(e.start_minutes),
        "start_minutes": e.start_minutes,
        "duration_minutes": e.duration_minutes,
        "completed": e.completed,
        "priority": e.priority,
    }


_MINUTES_DESC = "Minutes since midnight, e.g. 540 = 9:00 AM, 810 = 1:30 PM."
_DATE_DESC = 'ISO date string, e.g. "2026-07-05".'

FUNCTION_DECLARATIONS = [
    types.FunctionDeclaration(
        name="create_event",
        description="Create a new event on the user's schedule.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "title": types.Schema(type=types.Type.STRING, description="Event title."),
                "date": types.Schema(type=types.Type.STRING, description=_DATE_DESC),
                "start_minutes": types.Schema(type=types.Type.INTEGER, description=_MINUTES_DESC),
                "duration_minutes": types.Schema(type=types.Type.INTEGER, description="Duration in minutes."),
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
            required=["title", "date", "start_minutes", "duration_minutes"],
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
        description="Move an existing event to a new date and/or start time.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "event_id": types.Schema(type=types.Type.STRING, description="ID of the event to move."),
                "new_date": types.Schema(type=types.Type.STRING, description=_DATE_DESC),
                "new_start_minutes": types.Schema(type=types.Type.INTEGER, description=_MINUTES_DESC),
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
]

# Tools that change data — the client uses this to know when to refetch.
MUTATING_TOOLS = {"create_event", "move_event", "delete_event", "swap_events"}


async def _get_event(db: AsyncSession, event_id: str) -> Event | None:
    return await db.get(Event, event_id)


async def _create_event(db: AsyncSession, args: dict) -> dict:
    event = Event(
        title=args["title"],
        date=args["date"],
        start_minutes=int(args["start_minutes"]),
        duration_minutes=int(args["duration_minutes"]),
        priority=args.get("priority"),
        icon=args.get("icon", "default"),
    )
    db.add(event)
    await db.commit()
    return {"created": event_to_dict(event)}


async def _list_events(db: AsyncSession, args: dict) -> dict:
    query = select(Event)
    if args.get("start_date"):
        query = query.where(Event.date >= args["start_date"])
    if args.get("end_date"):
        query = query.where(Event.date <= args["end_date"])
    query = query.order_by(Event.date, Event.start_minutes)
    events = (await db.scalars(query)).all()
    return {"events": [event_to_dict(e) for e in events]}


async def _move_event(db: AsyncSession, args: dict) -> dict:
    event = await _get_event(db, args["event_id"])
    if event is None:
        return {"error": f"No event with id {args['event_id']}"}
    if args.get("new_date"):
        event.date = args["new_date"]
    if args.get("new_start_minutes") is not None:
        event.start_minutes = int(args["new_start_minutes"])
    await db.commit()
    return {"moved": event_to_dict(event)}


async def _delete_event(db: AsyncSession, args: dict) -> dict:
    event = await _get_event(db, args["event_id"])
    if event is None:
        return {"error": f"No event with id {args['event_id']}"}
    deleted = event_to_dict(event)
    await db.delete(event)
    await db.commit()
    return {"deleted": deleted}


async def _check_conflicts(db: AsyncSession, args: dict) -> dict:
    start = int(args["start_minutes"])
    end = start + int(args["duration_minutes"])
    query = select(Event).where(
        Event.date == args["date"],
        Event.start_minutes < end,
        Event.start_minutes + Event.duration_minutes > start,
    )
    if args.get("exclude_event_id"):
        query = query.where(Event.id != args["exclude_event_id"])
    conflicts = (await db.scalars(query)).all()
    return {
        "has_conflicts": len(conflicts) > 0,
        "conflicts": [event_to_dict(e) for e in conflicts],
    }


async def _swap_events(db: AsyncSession, args: dict) -> dict:
    a = await _get_event(db, args["event_id_a"])
    b = await _get_event(db, args["event_id_b"])
    if a is None or b is None:
        missing = args["event_id_a"] if a is None else args["event_id_b"]
        return {"error": f"No event with id {missing}"}
    a.date, b.date = b.date, a.date
    a.start_minutes, b.start_minutes = b.start_minutes, a.start_minutes
    await db.commit()
    return {"swapped": [event_to_dict(a), event_to_dict(b)]}


_EXECUTORS = {
    "create_event": _create_event,
    "list_events": _list_events,
    "move_event": _move_event,
    "delete_event": _delete_event,
    "check_conflicts": _check_conflicts,
    "swap_events": _swap_events,
}


async def execute_tool(db: AsyncSession, name: str, args: dict) -> dict:
    executor = _EXECUTORS.get(name)
    if executor is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return await executor(db, args)
    except Exception as exc:  # surface failures to Gemini instead of crashing the turn
        await db.rollback()
        return {"error": f"{type(exc).__name__}: {exc}"}
