"""Goal milestone scheduling: a deliberately separate, narrow feature from
the chat assistant in gemini.py, same relationship week_plan.py has to it.
For each milestone it runs its own scoped Gemini turn — proposing sessions
only within that milestone's own slice of the goal's timeline (see
MilestoneWindow) — rather than one combined call, so a milestone's sessions
can never drift into another milestone's window and the model never has to
juggle which proposal belongs to which milestone (this file tracks that
itself, from which call each proposal came out of).

Only ever proposes create_event calls (as pending actions, never executed
here) so the user reviews every session before anything is written —
POST /api/chat/confirm (already generic and chat-agnostic) is what actually
applies them, exactly as it does for chat and week_plan. Linking a created
task to its milestone happens client-side afterward, via the normal
goalStore action — this module and its endpoint never touch the Goal row.

This module intentionally does NOT import from or modify gemini.py's
run_chat/CHAT_INSTRUCTION, or touch ChatSheet.tsx on the frontend — a bug
here should not be able to affect the existing chat assistant.
"""

import logging

from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas import GoalScheduleResponse, MilestoneWindow, ScheduledTaskProposal
from app.services.gemini import get_client, resolve_today
from app.services.tools import FUNCTION_DECLARATIONS, execute_tool

logger = logging.getLogger("uvicorn.error")

# Same reasoning as week_plan.py's own subset: read-only lookups plus
# create_event only — this feature can only ever propose new sessions,
# never change or remove anything that already exists.
_ALLOWED_TOOLS = {"create_event", "check_conflicts", "list_events", "list_habits"}
_DECLARATIONS = [d for d in FUNCTION_DECLARATIONS if d.name in _ALLOWED_TOOLS]

MAX_ROUNDS_PER_MILESTONE = 6
MAX_SESSIONS_PER_MILESTONE = 6
# A whole goal can have several milestones; cap the total the same way
# week_plan caps a week, so a long milestone list can't fill the calendar.
MAX_TOTAL_SESSIONS = 20

INSTRUCTION = """You propose calendar sessions for ONE milestone of a larger goal, within a \
specific date window, by calling create_event. The user will review every session before anything \
is saved, so propose confidently — never ask clarifying questions. A session you describe in your \
reply but never actually call create_event for does not exist and will never be shown to the user, \
no matter how clearly you describe it — describing one is not the same as proposing it.

Rules:
- Every milestone gets at least one session, even a quick one — never skip a milestone or reply \
with only a description of what you'd do.
- First call list_events (or check_conflicts) to see what's already on the schedule within the \
given window — never propose a session that overlaps an existing item, or another session you \
already proposed this turn.
- Decide how many sessions this milestone realistically needs and how long each should be, based \
on how much work its label implies and how many days the window spans. A quick, small step \
("Pick a title") is one short session; a substantial one ("Write the draft") needs several \
sessions spread across the window, not crammed together — for a multi-week window that usually \
means 3-6 sessions, not one.
- Call create_event immediately for each session as you decide on it — don't stop to narrate your \
plan first and call the tools afterward; the calls are the proposal, not the reply text.
- Spread sessions across the window rather than stacking them on consecutive days, unless the \
window is only a few days long.
- Never propose a session outside the given start/end dates.
- Titles should be short and specific, and make clear which milestone they belong to (e.g. for \
milestone "Write the draft": "Draft: chapter 1", "Draft: chapter 2").
- Propose at most 6 sessions for this milestone.
- Only once every create_event call is made, reply with exactly one short sentence summarizing \
what you proposed. No markdown, no lists, and never mention a session you haven't already called \
create_event for."""

_NUDGE = (
    "You didn't call create_event yet — that text alone won't create anything. Call it now, "
    "once per session, for this milestone."
)


def _response_text(response: types.GenerateContentResponse | None) -> str | None:
    if response is None or not response.candidates:
        return None
    text = response.text
    return text.strip() if text and text.strip() else None


async def _schedule_one_milestone(
    db: AsyncSession,
    user_id: str,
    goal_title: str,
    today: str,
    milestone: MilestoneWindow,
    budget: int,
) -> tuple[str, list[ScheduledTaskProposal]]:
    client = get_client()
    config = types.GenerateContentConfig(
        system_instruction=INSTRUCTION,
        tools=[types.Tool(function_declarations=_DECLARATIONS)],
        temperature=0.4,
        thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
    )
    seed = (
        f'Goal: "{goal_title}"\n'
        f'Milestone: "{milestone.label}"\n'
        f"Window: {milestone.start_date} to {milestone.end_date} (today is {today})"
    )
    contents: list[types.Content] = [types.Content(role="user", parts=[types.Part(text=seed)])]

    proposals: list[ScheduledTaskProposal] = []
    cap = min(MAX_SESSIONS_PER_MILESTONE, budget)
    response = None
    nudged = False
    for _round in range(MAX_ROUNDS_PER_MILESTONE):
        response = await client.aio.models.generate_content(
            model=settings.gemini_model, contents=contents, config=config
        )
        if not response.function_calls:
            # A flash-lite quirk (see config.py's gemini_model comment):
            # sometimes it describes sessions in plain text instead of
            # actually calling create_event. One recovery attempt — if it
            # still hasn't called anything after that, accept defeat rather
            # than nudge forever.
            if not proposals and not nudged:
                nudged = True
                contents.append(response.candidates[0].content)
                contents.append(types.Content(role="user", parts=[types.Part(text=_NUDGE)]))
                continue
            break

        contents.append(response.candidates[0].content)
        result_parts = []
        for call in response.function_calls:
            args = dict(call.args or {})
            if call.name == "create_event":
                if len(proposals) >= cap:
                    result = {
                        "error": "too_many_actions",
                        "message": f"Stopped after {cap} sessions for this milestone.",
                    }
                else:
                    proposals.append(
                        ScheduledTaskProposal(milestone_id=milestone.id, tool=call.name, args=args)
                    )
                    result = {"pending_confirmation": True}
            else:
                result = await execute_tool(db, user_id, call.name, args)
            result_parts.append(
                types.Part.from_function_response(name=call.name, response={"result": result})
            )
        contents.append(types.Content(role="user", parts=result_parts))
        if len(proposals) >= cap:
            break

    message = _response_text(response) or f'Proposed {len(proposals)} sessions for "{milestone.label}".'
    return message, proposals


async def schedule_goal_milestones(
    db: AsyncSession,
    user_id: str,
    goal_title: str,
    milestones: list[MilestoneWindow],
    client_date: str | None = None,
) -> GoalScheduleResponse:
    if not milestones:
        return GoalScheduleResponse(message="No milestones to schedule.", proposals=[])

    today = resolve_today(client_date).isoformat()
    all_proposals: list[ScheduledTaskProposal] = []
    messages: list[str] = []
    for milestone in milestones:
        remaining = MAX_TOTAL_SESSIONS - len(all_proposals)
        if remaining <= 0:
            messages.append(f'Skipped "{milestone.label}" — already at the session limit for this pass.')
            continue
        msg, proposals = await _schedule_one_milestone(
            db, user_id, goal_title, today, milestone, remaining
        )
        all_proposals.extend(proposals)
        messages.append(msg)

    return GoalScheduleResponse(message=" ".join(messages), proposals=all_proposals)
