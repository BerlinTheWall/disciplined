"""Gemini chat: system prompt with the current week's schedule + manual tool loop."""

from datetime import date, timedelta
from functools import lru_cache

from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Event, Goal
from app.schemas import BriefingRequest, ChatAction, ChatMessage, ChatResponse
from app.services.nudges import NudgeCandidate
from app.services.tools import (
    FUNCTION_DECLARATIONS,
    current_period_keys,
    event_to_dict,
    execute_tool,
    fmt_minutes,
    goal_to_dict,
    habit_occurrences,
)

MAX_TOOL_ROUNDS = 8

_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@lru_cache
def get_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set (see backend/.env.example)")
    return genai.Client(api_key=settings.gemini_api_key)


def resolve_today(client_date: str | None) -> date:
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
    today = resolve_today(client_date)
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

    goals = (
        await db.scalars(
            select(Goal)
            .where(
                Goal.user_id == user_id,
                Goal.period_key.in_(current_period_keys(today).values()),
            )
            .order_by(Goal.period, Goal.order)
        )
    ).all()
    if goals:
        goal_lines = []
        for g in goals:
            info = await goal_to_dict(db, user_id, g)
            detail = {
                "manual": f"manual {info['current']}/{info['total']}",
                "tasks": f"{info['current']}/{info['total']} linked tasks done",
                "check": "check-off",
            }[info["mode"]]
            status = "done" if info["done"] else "not done"
            goal_lines.append(f"- id={g.id} | {g.period} | {g.title} | {detail} | {status}")
        goals_block = "\n".join(goal_lines)
    else:
        goals_block = "(no goals set for the current week/month/year)"

    return f"""You are the personal assistant for Disciplined, a personal productivity app.

Date reference — today is {_WEEKDAYS[today.weekday()]}, {today.isoformat()}:
{date_reference}

The user's schedule for the next 7 days:
{schedule}

The user's goals for the current week/month/year:
{goals_block}

Rules:
- Resolve relative dates ("today", "tomorrow", "friday", "next monday") yourself using the date reference above. Never ask the user for a date you can resolve; only ask when it is genuinely ambiguous.
- Times are minutes since midnight (540 = 9:00 AM). Always show the user human-readable times like "9:00 AM", never raw minutes.
- Reference events, habits and goals by their id when calling tools. Never invent or guess an id.
- The schedule mixes one-time events and recurring habits (marked "habit"). Habits are a full part of the user's day — include them when listing or summarizing a day. You can create/move/delete/swap events and mark an event done or not with set_event_completion. For habits, you can only mark a given date's occurrence done or not with set_habit_completion — habits still can't be created, deleted, retimed, renamed, or have their days changed through chat; explain those are edited in the Habits tab.
- Goals have three progress modes, shown above: "manual N/M" goals accept add_goal_progress (positive or negative). "X/Y linked tasks done" goals are task-linked — their progress comes automatically from finishing those tasks, so use set_event_completion on the linked task(s) rather than trying to set progress directly; only use set_goal_done on a task-linked goal if the user explicitly wants it marked done regardless of the linked tasks. "check-off" goals only support set_goal_done. Goals cannot be created or deleted through chat. Use list_goals for goals outside the current week/month/year shown above.
- Nothing changes unless you call a tool for it. Never tell the user something was created, moved, deleted, swapped, completed, or had its progress changed unless you called the corresponding tool (create_event, move_event, delete_event, swap_events, set_event_completion, set_habit_completion, add_goal_progress, set_goal_done) for it in this conversation turn and it returned without an error.
- To create or move, call create_event / move_event directly — they check for conflicts themselves. If they return slot_taken, nothing changed: tell the user about the overlap and suggest a free alternative. Use check_conflicts only to answer availability questions ("am I free at 3?").
- For events outside the 7 days shown above, use list_events to look them up first.
- Do not ask clarifying questions when a default works. Missing title: derive it from the message ("add a meeting tomorrow" -> "Meeting"). Missing time or duration: simply omit those arguments when calling create_event — it auto-picks a free slot and defaults to 60 minutes; report back what was picked. Create right away; the user will correct you if needed. Only ask when the request is truly ambiguous (e.g. which of two matching events to delete).
- Keep replies short and conversational. Confirm what you did after making changes."""


BRIEFING_INSTRUCTION = """You are the user's personal assistant inside their day-planner app. \
Write the short briefing you will SAY OUT LOUD about their schedule — like a trusted \
chief of staff briefing a manager they like working for.

Rules:
- Spoken prose only: no markdown, no bullet points, no emojis, no headings, no stage directions.
- At most 110 words; prefer 60 to 90.
- If a name is given, address them by it once, near the start.
- Say times like "9 AM" or "2:30 PM". Never use 24-hour times.
- Walk through the remaining items in time order, but do not robotically recite every \
detail — group and summarize, and call out what actually matters: back-to-back stretches, \
a long free gap worth using, or an unusually early or late item.
- If some items are already completed, acknowledge the progress in a few words.
- If a streak is listed, weave in one short encouraging mention of it.
- If nothing is scheduled, say the day is open and gently suggest planning one or two things.
- Talk only about what is in the data. Never invent items, times, people, weather, or \
references to earlier conversations — there were none.
- Only describe an item as done if it is marked "already completed". Items without that \
mark are still ahead — never congratulate work that has not happened.
- Daily habits in the schedule count as much as tasks — include them in the walk-through.
- Items marked "past its start time, still not done" were missed, not finished: mention \
them briefly and nudge one decision — do it now, move it, or let it go. Never skip them \
and never assume they happened.
- When the schedule is sparse, keep the briefing short rather than padding it with filler.
- Tone: warm, composed, professional. Encouraging but never gushing."""


def write_briefing_prompt(req: BriefingRequest) -> str:
    lines = [f"Day being briefed: {req.day_label}"]
    lines.append(f"User's name: {req.name or '(not given)'}")
    if req.now_minutes is not None:
        lines.append(
            f"Current time: {fmt_minutes(req.now_minutes)} — items starting earlier have passed."
        )
    if req.items:
        lines.append("Schedule (in start-time order):")
        for item in sorted(req.items, key=lambda i: i.start_minutes):
            end = item.start_minutes + item.duration_minutes
            flags = []
            if item.kind == "habit":
                flags.append("daily habit")
            if item.completed:
                flags.append("already completed")
            elif req.now_minutes is not None and item.start_minutes < req.now_minutes:
                flags.append("past its start time, still not done")
            suffix = f" ({', '.join(flags)})" if flags else ""
            lines.append(
                f"- {fmt_minutes(item.start_minutes)}-{fmt_minutes(end)}: {item.title}{suffix}"
            )
    else:
        lines.append("Schedule: (nothing scheduled)")
    if req.streaks:
        lines.append("Active streaks:")
        for s in req.streaks:
            lines.append(f"- {s.title}: {s.days} days in a row")
    return "\n".join(lines)


async def write_briefing(req: BriefingRequest) -> str:
    client = get_client()
    response = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=write_briefing_prompt(req),
        config=types.GenerateContentConfig(
            system_instruction=BRIEFING_INSTRUCTION,
            # Some day-to-day variety, but low enough to stay strictly factual
            # (0.8 produced invented details on sparse days).
            temperature=0.5,
            thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
        ),
    )
    script = _response_text(response)
    if not script:
        raise RuntimeError("empty briefing from the model")
    return script


NUDGE_INSTRUCTION = """You are the personal assistant inside Disciplined, a day-planner app. \
You noticed something worth mentioning on your own — the user didn't ask. Write the short \
message you'll show them about it.

Rules:
- Plain prose, 1-2 sentences. No markdown, no bullet points, no emojis.
- Reference only the specific numbers/facts given to you. Never invent details.
- End with a natural, low-pressure yes/no offer to take the given action — never guilt-trip \
or nag; this is a friendly heads-up, not a scolding.
- If no concrete action was given, just name what you noticed without offering to do anything.
- Tone: warm, brief, matter-of-fact."""


def write_nudge_prompt(candidate: NudgeCandidate, slot: dict | None) -> str:
    lines = [f"What you noticed: {candidate.type}", f"Subject: {candidate.subject_title}"]
    if candidate.type == "workout_gap":
        lines.append(f"Days since the last completed workout: {candidate.metric['gap_days']}")
        lines.append("Proposed action: offer to schedule one, at the slot below if given.")
    elif candidate.type == "habit_gap":
        lines.append(f"Consecutive missed days for this habit: {candidate.metric['miss_streak']}")
        lines.append("Proposed action: offer to schedule a slot for it today, if a slot is given below.")
    else:
        pct = round(candidate.metric["elapsed"] * 100)
        lines.append(f"This goal's period is {pct}% elapsed and it's behind pace and not done yet.")
        lines.append("Proposed action: none — just point out it needs attention.")
    if slot is not None:
        when = "today" if slot["date"] == date.today().isoformat() else "tomorrow"
        lines.append(
            f"A free slot exists {when} at {fmt_minutes(slot['start_minutes'])} "
            f"for {slot['duration_minutes']} minutes."
        )
    else:
        lines.append("No specific free slot was found nearby.")
    return "\n".join(lines)


async def write_nudge(candidate: NudgeCandidate, slot: dict | None) -> str:
    client = get_client()
    response = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=write_nudge_prompt(candidate, slot),
        config=types.GenerateContentConfig(
            system_instruction=NUDGE_INSTRUCTION,
            temperature=0.6,
            thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
        ),
    )
    text = _response_text(response)
    if not text:
        raise RuntimeError("empty nudge from the model")
    return text


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
        thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
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
                system_instruction=config.system_instruction,
                temperature=0.2,
                thinking_config=types.ThinkingConfig(
                    thinking_budget=settings.gemini_thinking_budget
                ),
            ),
        )
        reply = _response_text(response)

    return ChatResponse(
        reply=reply or "Sorry — something went wrong on my side. Please try that again.",
        actions=actions,
    )
