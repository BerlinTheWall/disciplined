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
from app.services.tools import FUNCTION_DECLARATIONS, execute_tool, fmt_minutes

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


async def build_system_prompt(db: AsyncSession, client_date: str | None = None) -> str:
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
            .where(Event.date >= today.isoformat(), Event.date <= week_end.isoformat())
            .order_by(Event.date, Event.start_minutes)
        )
    ).all()

    if events:
        lines = []
        for e in events:
            day = _WEEKDAYS[date.fromisoformat(e.date).weekday()]
            end = e.start_minutes + e.duration_minutes
            status = " (completed)" if e.completed else ""
            lines.append(
                f"- id={e.id} | {day} {e.date} {fmt_minutes(e.start_minutes)}-{fmt_minutes(end)}"
                f" | {e.title}{status}"
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
    message: str,
    history: list[ChatMessage],
    client_date: str | None = None,
) -> ChatResponse:
    client = get_client()
    config = types.GenerateContentConfig(
        system_instruction=await build_system_prompt(db, client_date),
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
            result = await execute_tool(db, call.name, args)
            actions.append(ChatAction(tool=call.name, args=args, result=result))
            result_parts.append(
                types.Part.from_function_response(name=call.name, response={"result": result})
            )
        contents.append(types.Content(role="user", parts=result_parts))

    reply = _response_text(response)
    if reply is None and actions:
        # The model occasionally goes silent after a tool round — nudge once for
        # a plain-text summary (tools disabled so it must answer in words).
        if response is not None and response.candidates and response.candidates[0].content:
            contents.append(response.candidates[0].content)
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part(text="Briefly tell me what you did and the outcome.")],
            )
        )
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=config.system_instruction, temperature=0.2
            ),
        )
        reply = _response_text(response)

    return ChatResponse(
        reply=reply or "Sorry, I couldn't finish that request — please try rephrasing.",
        actions=actions,
    )
