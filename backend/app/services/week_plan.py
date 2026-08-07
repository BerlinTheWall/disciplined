"""Week auto-plan: a deliberately separate, narrow feature from the chat
assistant in gemini.py. It only ever proposes create_event calls (as
PendingAction, never executed here) so the user reviews every event before
anything is written — POST /api/chat/confirm (already generic and
chat-agnostic) is what actually applies them, exactly as it does for chat
and nudges.

Generation is scoped strictly to what the user explicitly picked in the
wizard (see WeekPlanPreference) — the model doesn't decide what deserves
time, only how to fit each requested item into the week.

This module intentionally does NOT import from or modify gemini.py's
run_chat/CHAT_INSTRUCTION, or touch ChatSheet.tsx on the frontend — a bug
here should not be able to affect the existing chat assistant.
"""

import logging

from google import genai
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas import PendingAction, WeekPlanPreference, WeekPlanResponse
from app.services.gemini import build_chat_context, get_client, resolve_today
from app.services.tools import FUNCTION_DECLARATIONS, MUTATING_TOOLS, execute_tool

logger = logging.getLogger("uvicorn.error")

# Only tools a week-plan pass is allowed to touch: read-only lookups plus
# create_event. No delete/update/move — this feature can only ever propose
# new events, never change or remove anything that already exists.
_ALLOWED_TOOLS = {
    "create_event",
    "check_conflicts",
    "list_events",
    "list_calendar_events",
    "list_goals",
    "list_habits",
}
_WEEK_PLAN_DECLARATIONS = [d for d in FUNCTION_DECLARATIONS if d.name in _ALLOWED_TOOLS]

WEEK_PLAN_MAX_ROUNDS = 10
# A week's worth of proposals runs larger than a normal chat turn's cap, but
# still well short of "filled the calendar" — same rationale as chat's
# MAX_ACTIONS_PER_TURN, tuned up slightly for a 7-day scope.
WEEK_PLAN_MAX_ACTIONS = 25

_TIME_OF_DAY_BAND = {
    "morning": "sometime between 6:00 AM and 11:00 AM",
    "afternoon": "sometime between 12:00 PM and 5:00 PM",
    "evening": "sometime between 5:00 PM and 9:00 PM",
    "any": "any reasonable time of day",
}

WEEK_PLAN_INSTRUCTION = """You are Disciplined's week-planning assistant. The user has already \
picked, in a wizard, exactly what they want scheduled this week and how often — your only job is \
to fit each requested item into the next 7 days as create_event calls. Do not add anything the \
user didn't list, and do not skip anything they did list. The user will review every event you \
propose before anything is saved, so propose confidently — don't ask clarifying questions.

Rules:
- For each item in "What the user wants scheduled" below, propose exactly its stated number of \
create_event calls this week — spread across different days, not stacked on one day unless the \
count genuinely requires it.
- Honor each item's stated time-of-day preference for every occurrence you propose for it.
- Never propose an event that duplicates something already on the schedule block (a habit \
occurrence or existing event covering the same thing) — check it first.
- Only propose events in genuinely free time. The schedule block reflects the real schedule as of \
now, but it does NOT update as you propose new events in this same session — you must track your \
own proposals yourself so no two of them ever overlap each other, including two occurrences of the \
same item. Use check_conflicts if you are not confident a slot is free against the real schedule.
- Titles should be short and specific (e.g. "Reading", "Draft project outline" — the item's own \
title is usually the right title). Pick a sensible duration (30-90 minutes) for the kind of activity.
- When you are done proposing, reply with one short (1-2 sentence) plain-language summary of what \
you added. No markdown, no lists."""


def _response_text(response: types.GenerateContentResponse | None) -> str | None:
    if response is None or not response.candidates:
        return None
    text = response.text
    return text.strip() if text and text.strip() else None


def _format_preferences(preferences: list[WeekPlanPreference]) -> str:
    lines = []
    for p in preferences:
        kind_label = "Interest" if p.kind == "interest" else "Goal"
        times = f"{p.times_per_week}x this week"
        band = _TIME_OF_DAY_BAND[p.time_of_day]
        lines.append(f'- {kind_label} "{p.title}" — {times}, {band}')
    return "\n".join(lines)


async def generate_week_plan(
    db: AsyncSession,
    user_id: str,
    preferences: list[WeekPlanPreference],
    client_date: str | None = None,
) -> WeekPlanResponse:
    if not preferences:
        return WeekPlanResponse(
            message="You didn't select anything to plan — go back and pick at least one activity or goal.",
            pending_actions=[],
        )

    client: genai.Client = get_client()
    today = resolve_today(client_date)
    context = await build_chat_context(db, user_id, client_date)

    config = types.GenerateContentConfig(
        system_instruction=WEEK_PLAN_INSTRUCTION,
        tools=[types.Tool(function_declarations=_WEEK_PLAN_DECLARATIONS)],
        temperature=0.4,
        thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
    )
    seed = (
        f"Plan my week (today is {today.isoformat()}).\n\n"
        "What the user wants scheduled:\n" + _format_preferences(preferences)
    )
    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part(text=context)]),
        types.Content(role="user", parts=[types.Part(text=seed)]),
    ]

    pending_actions: list[PendingAction] = []
    response = None
    for round_num in range(WEEK_PLAN_MAX_ROUNDS):
        response = await client.aio.models.generate_content(
            model=settings.gemini_model, contents=contents, config=config
        )
        if not response.function_calls:
            break

        contents.append(response.candidates[0].content)
        result_parts = []
        for call in response.function_calls:
            args = dict(call.args or {})
            if call.name in MUTATING_TOOLS:
                if len(pending_actions) >= WEEK_PLAN_MAX_ACTIONS:
                    result = {
                        "error": "too_many_actions",
                        "message": (
                            f"Stopped after {WEEK_PLAN_MAX_ACTIONS} proposed events — that's "
                            "already a full week. Propose no more."
                        ),
                    }
                else:
                    pending_actions.append(PendingAction(tool=call.name, args=args))
                    result = {"pending_confirmation": True}
            else:
                result = await execute_tool(db, user_id, call.name, args)
            result_parts.append(
                types.Part.from_function_response(name=call.name, response={"result": result})
            )
        contents.append(types.Content(role="user", parts=result_parts))
        if len(pending_actions) >= WEEK_PLAN_MAX_ACTIONS:
            break

    message = _response_text(response)
    if message is None:
        message = (
            f"I added {len(pending_actions)} things to your week — take a look below."
            if pending_actions
            else "I didn't find anything worth adding to your week right now."
        )

    return WeekPlanResponse(message=message, pending_actions=pending_actions)
