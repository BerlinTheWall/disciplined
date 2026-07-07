"""Gemini chat: system prompt with the current week's schedule + manual tool loop."""

from datetime import date, timedelta
from functools import lru_cache

from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Event
from app.schemas import ChatAction, ChatMessage, ChatResponse
from app.services.tools import (
    FUNCTION_DECLARATIONS,
    event_to_dict,
    execute_tool,
    fmt_minutes,
    habit_occurrences,
)

MAX_TOOL_ROUNDS = 8

_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@lru_cache
def get_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set (see backend/.env.example)")
    return genai.Client(api_key=settings.gemini_api_key)


def _resolve_today(client_date: str | None) -> date:
    """The user's local date wins; fall back to the server clock."""
    if client_date:
        try:
            return date.fromisoformat(client_date)
        except ValueError:
            pass
    return date.today()


async def build_system_prompt(
    db: AsyncSession, user_id: str, client_date: str | None = None
) -> str:
    today = _resolve_today(client_date)
    week_end = today + timedelta(days=6)

    # Explicit weekday -> date table so the model never has to do date
    # arithmetic (small models get "tomorrow" wrong without this).
    day_lines = []
    for offset in range(7):
        d = today + timedelta(days=offset)
        label = {0: " (TODAY)", 1: " (TOMORROW)"}.get(offset, "")
        day_lines.append(f"- {_WEEKDAYS[d.weekday()]} {d.isoformat()}{label}")
    date_reference = "\n".join(day_lines)

    events = (
        await db.scalars(
            select(Event)
            .where(
                Event.user_id == user_id,
                Event.date >= today.isoformat(),
                Event.date <= week_end.isoformat(),
            )
            .order_by(Event.date, Event.start_minutes)
        )
    ).all()

    # The day's schedule is events plus recurring-habit occurrences, merged.
    items = [event_to_dict(e) for e in events]
    items += await habit_occurrences(db, user_id, today.isoformat(), week_end.isoformat())
    items.sort(key=lambda i: (i["date"], i["start_minutes"]))

    if items:
        lines = []
        for item in items:
            day = _WEEKDAYS[date.fromisoformat(item["date"]).weekday()]
            end = item["start_minutes"] + item["duration_minutes"]
            kind = " | habit (repeats)" if item["kind"] == "habit" else ""
            status = " (completed)" if item["completed"] else ""
            lines.append(
                f"- id={item['id']} | {day} {item['date']}"
                f" {fmt_minutes(item['start_minutes'])}-{fmt_minutes(end)}"
                f" | {item['title']}{kind}{status}"
            )
        schedule = "\n".join(lines)
    else:
        schedule = "(nothing scheduled in the next 7 days)"

    return f"""You are the scheduling assistant for Disciplined, a personal productivity app.

Date reference — today is {_WEEKDAYS[today.weekday()]}, {today.isoformat()}:
{date_reference}

The user's schedule for the next 7 days:
{schedule}

Rules:
- Resolve relative dates ("today", "tomorrow", "friday", "next monday") yourself using the date reference above. Never ask the user for a date you can resolve; only ask when it is genuinely ambiguous.
- Times are minutes since midnight (540 = 9:00 AM). Always show the user human-readable times like "9:00 AM", never raw minutes.
- Reference events by their id when calling tools. Never invent or guess an id.
- The schedule mixes one-time events and recurring habits (marked "habit"). Habits are a full part of the user's day — include them when listing or summarizing a day. Your tools can only change events: if asked to move, delete or edit a habit, explain that habits are managed in the app's Habits tab.
- Nothing changes unless you call a tool for it. Never tell the user something was created, moved, deleted or swapped unless you called create_event, move_event, delete_event or swap_events for it in this conversation turn and it returned without an error.
- To create or move, call create_event / move_event directly — they check for conflicts themselves. If they return slot_taken, nothing changed: tell the user about the overlap and suggest a free alternative. Use check_conflicts only to answer availability questions ("am I free at 3?").
- For events outside the 7 days shown above, use list_events to look them up first.
- Do not ask clarifying questions when a default works. Missing title: derive it from the message ("add a meeting tomorrow" -> "Meeting"). Missing time or duration: simply omit those arguments when calling create_event — it auto-picks a free slot and defaults to 60 minutes; report back what was picked. Create right away; the user will correct you if needed. Only ask when the request is truly ambiguous (e.g. which of two matching events to delete).
- Keep replies short and conversational. Confirm what you did after making changes."""


def _to_contents(history: list[ChatMessage], message: str) -> list[types.Content]:
    contents = [
        types.Content(role=m.role, parts=[types.Part(text=m.content)]) for m in history
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    return contents


def _response_text(response: types.GenerateContentResponse | None) -> str | None:
    if response is None or not response.candidates:
        return None
    text = response.text
    return text.strip() if text and text.strip() else None


async def run_chat(
    db: AsyncSession,
    user_id: str,
    message: str,
    history: list[ChatMessage],
    client_date: str | None = None,
) -> ChatResponse:
    client = get_client()
    config = types.GenerateContentConfig(
        system_instruction=await build_system_prompt(db, user_id, client_date),
        tools=[types.Tool(function_declarations=FUNCTION_DECLARATIONS)],
        # Tool selection needs to be dependable more than creative.
        temperature=0.2,
    )
    contents = _to_contents(history, message)
    actions: list[ChatAction] = []

    response = None
    for _ in range(MAX_TOOL_ROUNDS):
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=config,
        )
        if not response.function_calls:
            break

        # Append the model's turn (with its function calls), execute each call,
        # then feed the results back as function_response parts.
        contents.append(response.candidates[0].content)
        result_parts = []
        for call in response.function_calls:
            args = dict(call.args or {})
            result = await execute_tool(db, user_id, call.name, args)
            actions.append(ChatAction(tool=call.name, args=args, result=result))
            result_parts.append(
                types.Part.from_function_response(name=call.name, response={"result": result})
            )
        contents.append(types.Content(role="user", parts=result_parts))

    reply = _response_text(response)
    if reply is None:
        # The model occasionally returns an empty final message (it spent the
        # turn thinking, or a malformed tool call got dropped). This is a model
        # hiccup, not bad user input — retry once, explicitly demanding plain
        # text with tools disabled so it can't go silent into another round.
        if response is not None and response.candidates:
            content = response.candidates[0].content
            # Don't re-append a turn with unanswered function calls — the API
            # rejects a function_call that isn't followed by its response.
            has_pending_calls = bool(content and content.parts) and any(
                p.function_call for p in content.parts
            )
            if content and content.parts and not has_pending_calls:
                contents.append(content)
        nudge = (
            "Briefly tell the user what you did and the outcome, in plain text."
            if actions
            else "Reply to the user now, in plain text."
        )
        contents.append(types.Content(role="user", parts=[types.Part(text=nudge)]))
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=config.system_instruction, temperature=0.2
            ),
        )
        reply = _response_text(response)

    return ChatResponse(
        reply=reply or "Sorry — something went wrong on my side. Please try that again.",
        actions=actions,
    )
