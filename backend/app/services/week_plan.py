"""Week auto-plan: a deliberately separate, narrow feature from the chat
assistant in gemini.py. It only ever proposes create_event calls (as
PendingAction, never executed here) so the user reviews every event before
anything is written — POST /api/chat/confirm (already generic and
chat-agnostic) is what actually applies them, exactly as it does for chat
and nudges.

This module intentionally does NOT import from or modify gemini.py's
run_chat/CHAT_INSTRUCTION, or touch ChatSheet.tsx on the frontend — a bug
here should not be able to affect the existing chat assistant.
"""

import logging

from google import genai
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas import PendingAction, WeekPlanResponse
from app.services.gemini import build_chat_context, get_client, resolve_today
from app.services.tools import FUNCTION_DECLARATIONS, MUTATING_TOOLS, execute_tool

logger = logging.getLogger("uvicorn.error")

# Only tools a week-plan pass is allowed to touch: read-only lookups plus
# create_event. No delete/update/move — this feature can only ever propose
# new events, never change or remove anything that already exists.
_ALLOWED_TOOLS = {"create_event", "check_conflicts", "list_events", "list_goals", "list_habits"}
_WEEK_PLAN_DECLARATIONS = [d for d in FUNCTION_DECLARATIONS if d.name in _ALLOWED_TOOLS]

WEEK_PLAN_MAX_ROUNDS = 10
# A week's worth of proposals runs larger than a normal chat turn's cap, but
# still well short of "filled the calendar" — same rationale as chat's
# MAX_ACTIONS_PER_TURN, tuned up slightly for a 7-day scope.
WEEK_PLAN_MAX_ACTIONS = 25

WEEK_PLAN_INSTRUCTION = """You are Disciplined's week-planning assistant. You've been asked to build \
a first draft of the user's schedule for the next 7 days from the context message. The user will \
review every event you propose before anything is saved, so propose confidently — don't ask \
clarifying questions, just make reasonable choices.

Rules:
- Look at the goals listed in the context message, especially any that are behind pace, not yet \
started, or have no linked tasks. For each one that plausibly needs dedicated time this week, \
propose one or more create_event calls that would make progress on it.
- Never propose an event that duplicates something already on the schedule block (a habit \
occurrence or existing event covering the same thing) — check it first.
- Only propose events in genuinely free time. The schedule block reflects the real schedule as of \
now, but it does NOT update as you propose new events in this same session — you must track your \
own proposals yourself so no two of them ever overlap each other. When unsure, spread proposals \
across different times of day and different days. Use check_conflicts if you are not confident a \
slot is free against the real schedule.
- Titles should be short and specific to the goal (e.g. "Draft project outline", not "Goal work"). \
Pick a sensible duration (30-90 minutes) and a reasonable time of day for the kind of task.
- Do not propose more than about 2-3 new events on any single day — the goal is a realistic week, \
not a maximally full one.
- If there is genuinely nothing worth proposing (no goals, or the week already covers everything), \
say so plainly and propose nothing.
- When you are done proposing (or decide there's nothing to propose), reply with one short \
(1-2 sentence) plain-language summary of what you added. No markdown, no lists."""


def _response_text(response: types.GenerateContentResponse | None) -> str | None:
    if response is None or not response.candidates:
        return None
    text = response.text
    return text.strip() if text and text.strip() else None


async def generate_week_plan(
    db: AsyncSession, user_id: str, client_date: str | None = None
) -> WeekPlanResponse:
    client: genai.Client = get_client()
    today = resolve_today(client_date)
    context = await build_chat_context(db, user_id, client_date)

    config = types.GenerateContentConfig(
        system_instruction=WEEK_PLAN_INSTRUCTION,
        tools=[types.Tool(function_declarations=_WEEK_PLAN_DECLARATIONS)],
        temperature=0.4,
        thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
    )
    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part(text=context)]),
        types.Content(
            role="user",
            parts=[types.Part(text=f"Plan my week (today is {today.isoformat()}).")],
        ),
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
