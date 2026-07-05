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


async def build_system_prompt(db: AsyncSession) -> str:
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)

    events = (
        await db.scalars(
            select(Event)
            .where(Event.date >= monday.isoformat(), Event.date <= sunday.isoformat())
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
        schedule = "(no events scheduled this week)"

    return f"""You are the scheduling assistant for Disciplined, a personal productivity app.
Today is {_WEEKDAYS[today.weekday()]}, {today.isoformat()}.

The user's schedule for this week ({monday.isoformat()} to {sunday.isoformat()}):
{schedule}

Rules:
- Times are minutes since midnight (540 = 9:00 AM). Always show the user human-readable times like "9:00 AM", never raw minutes.
- Reference events by their id when calling tools. Never invent or guess an id.
- Before creating or moving an event, use check_conflicts on the target slot; warn the user about overlaps and suggest an alternative if there is one.
- For events outside the week shown above, use list_events to look them up first.
- When the user is vague ("tomorrow morning"), pick a sensible time and say what you chose.
- Keep replies short and conversational. Confirm what you did after making changes."""


def _to_contents(history: list[ChatMessage], message: str) -> list[types.Content]:
    contents = [
        types.Content(role=m.role, parts=[types.Part(text=m.content)]) for m in history
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    return contents


async def run_chat(db: AsyncSession, message: str, history: list[ChatMessage]) -> ChatResponse:
    client = get_client()
    config = types.GenerateContentConfig(
        system_instruction=await build_system_prompt(db),
        tools=[types.Tool(function_declarations=FUNCTION_DECLARATIONS)],
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

    reply = (response.text if response else None) or "Sorry, I couldn't finish that request."
    return ChatResponse(reply=reply, actions=actions)
