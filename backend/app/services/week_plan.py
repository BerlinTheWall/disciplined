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
from string import ascii_lowercase
from typing import NamedTuple

from google import genai
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas import WeekPlanPreference, WeekPlanProposal, WeekPlanResponse
from app.services.gemini import build_chat_context, get_client, resolve_today
from app.services.tools import (
    FUNCTION_DECLARATIONS,
    MUTATING_TOOLS,
    execute_tool,
    validate_tool_args,
)

logger = logging.getLogger("uvicorn.error")

# Only tools a week-plan pass is allowed to touch: read-only lookups plus
# create_event. No delete/update/move — this feature can only ever propose
# new events, never change or remove anything that already exists.
_ALLOWED_TOOLS = {
    "create_event",
    "check_conflicts",
    "list_events",
    "list_goals",
    "list_habits",
}
# One extra parameter on this feature's copy of create_event: which wizard
# item the event is for. A single pass proposes every item's events at once,
# so nothing downstream can attribute them afterwards — matching on the title
# is guesswork the moment a title is milestone-derived rather than the goal's
# own. It is stripped from the args before the call becomes a proposal, so
# the shared create_event schema (and everything else calling it) is
# untouched. See _strip_plan_item.
_PLAN_ITEM_ID = "plan_item_id"


def _week_plan_declarations() -> list[types.FunctionDeclaration]:
    decls = []
    for d in FUNCTION_DECLARATIONS:
        if d.name not in _ALLOWED_TOOLS:
            continue
        if d.name != "create_event":
            decls.append(d)
            continue
        properties = dict(d.parameters.properties or {})
        properties[_PLAN_ITEM_ID] = types.Schema(
            type=types.Type.STRING,
            description=(
                "The id of the item from 'What the user wants scheduled' that this event is "
                "for, copied exactly (e.g. 'item_2'). Required for every event you propose."
            ),
        )
        decls.append(
            types.FunctionDeclaration(
                name=d.name,
                description=d.description,
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties=properties,
                    required=[*(d.parameters.required or []), _PLAN_ITEM_ID],
                ),
            )
        )
    return decls


_WEEK_PLAN_DECLARATIONS = _week_plan_declarations()

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
- Every create_event call must carry plan_item_id, copied exactly from the list below: the id of \
the specific next step the event does when it does one (e.g. "item_2a"), otherwise the id of the \
item itself (e.g. "item_2"). An event proposed without it cannot be shown to the user.
- For each item in "What the user wants scheduled" below, propose exactly its stated number of \
create_event calls this week — spread across different days, not stacked on one day unless the \
count genuinely requires it.
- An item listing "already scheduled" lines already has that many of its occurrences on the \
calendar this week. Those count toward its number: propose only the remainder, and propose nothing \
at all for an item that has already met it. Never re-propose a session already listed there.
- An item listing "next step" lines is a goal broken into milestones. Schedule the next steps \
themselves, in the order given, one step per event — that is what actually moves the goal forward. \
Title each event after the step it does (e.g. "Draft: chapter 1"), not after the goal, and pass \
that step's own id as plan_item_id. Only fall back to generic sessions named after the goal, under \
the item's own id, when an item lists no next steps at all.
- An item listing a "due" date is running out of runway: keep every event for it on or before that \
date, and prefer earlier in the week when the date is close.
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
you added. If every item was already fully covered and you proposed nothing, say that instead. No \
markdown, no lists."""


def _response_text(response: types.GenerateContentResponse | None) -> str | None:
    if response is None or not response.candidates:
        return None
    text = response.text
    return text.strip() if text and text.strip() else None


class _PlanTarget(NamedTuple):
    """What one plan_item_id resolves to: always the wizard item, plus the
    specific open milestone when the key names a next step rather than the
    item as a whole."""

    preference: WeekPlanPreference
    milestone_id: str | None


def _format_preferences(
    preferences: list[WeekPlanPreference],
) -> tuple[str, dict[str, _PlanTarget]]:
    """The wizard picks as prompt text, plus the key -> target map that turns
    each proposal's plan_item_id back into what it was scheduled for.

    A goal's open milestones each get their own key under it, so the model
    can name the actual step an event does — that is what allows the session
    to be linked to the milestone on confirm. Short synthetic keys rather
    than the real ids: the model only has to copy them back verbatim, and a
    mistyped "item_3a" fails visibly against this map instead of quietly
    resolving to some other goal the way a near-miss uuid could."""
    by_key: dict[str, _PlanTarget] = {}
    lines = []
    for i, p in enumerate(preferences, start=1):
        key = f"item_{i}"
        by_key[key] = _PlanTarget(p, None)
        kind_label = "Interest" if p.kind == "interest" else "Goal"
        times = f"{p.times_per_week}x this week"
        band = _TIME_OF_DAY_BAND[p.time_of_day]
        lines.append(f'- {key}: {kind_label} "{p.title}" — {times}, {band}')
        # Goal context, each line present only when the client sent it — an
        # interest has none of it and reads exactly as it did before.
        if p.progress_label:
            lines.append(f"    progress: {p.progress_label}")
        if p.deadline:
            lines.append(f"    due: {p.deadline}")
        for j, milestone in enumerate(p.open_milestones, start=1):
            step_key = f"{key}{ascii_lowercase[j - 1]}" if j <= 26 else f"{key}s{j}"
            by_key[step_key] = _PlanTarget(p, milestone.id)
            lines.append(f"    next step {step_key}: {milestone.label}")
        for line in p.scheduled_this_week:
            lines.append(f"    already scheduled: {line}")
    return "\n".join(lines), by_key


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
    prefs_text, prefs_by_key = _format_preferences(preferences)
    seed = (
        f"Plan my week (today is {today.isoformat()}).\n\n"
        "What the user wants scheduled:\n" + prefs_text
    )
    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part(text=context)]),
        types.Content(role="user", parts=[types.Part(text=seed)]),
    ]

    pending_actions: list[WeekPlanProposal] = []
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
            # Off before validation: plan_item_id exists only on this
            # feature's copy of the declaration, so create_event itself has
            # never heard of it and would (rightly) reject it as a stray arg.
            target = prefs_by_key.get(args.pop(_PLAN_ITEM_ID, "") or "")
            if call.name in MUTATING_TOOLS:
                # Same reason as chat's: confirming a proposal runs its args
                # verbatim, so a call with fields create_event doesn't take
                # has to be rejected while the model can still fix it.
                bad_call = validate_tool_args(call.name, args)
                if bad_call is not None:
                    result = bad_call
                elif len(pending_actions) >= WEEK_PLAN_MAX_ACTIONS:
                    result = {
                        "error": "too_many_actions",
                        "message": (
                            f"Stopped after {WEEK_PLAN_MAX_ACTIONS} proposed events — that's "
                            "already a full week. Propose no more."
                        ),
                    }
                else:
                    pending_actions.append(
                        WeekPlanProposal(
                            tool=call.name,
                            args=args,
                            source_kind=target.preference.kind if target else None,
                            source_id=target.preference.id if target else None,
                            source_milestone_id=target.milestone_id if target else None,
                        )
                    )
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
