"""Gemini chat: system prompt with the current week's schedule + manual tool loop."""

import logging
from datetime import date, timedelta
from functools import lru_cache

from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Event, Goal, Habit
from app.schemas import BriefingRequest, ChatAction, ChatMessage, ChatResponse, PendingAction
from app.services.nudges import NudgeCandidate
from app.services.tools import (
    FUNCTION_DECLARATIONS,
    MUTATING_TOOLS,
    current_period_keys,
    event_to_dict,
    execute_tool,
    fmt_minutes,
    goal_to_dict,
    habit_occurrences,
    habit_recurrence_label,
)

MAX_TOOL_ROUNDS = 8
# A circuit breaker independent of prompt compliance: a single round can carry
# several function calls at once (not just MAX_TOOL_ROUNDS-many total), and a
# confused model has been observed proposing dozens of near-duplicate creates
# in one turn (e.g. a blank/misfired voice transcript tiling the whole day
# with "Meeting"). Comfortably above any real single-turn request (the
# largest legitimate case is a scoped bulk delete) but well below "filled the
# calendar."
MAX_ACTIONS_PER_TURN = 20

logger = logging.getLogger("uvicorn.error")

_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Everything here is identical on every single call, for every user — never
# interpolated. Gemini 2.5's implicit caching (on by default) discounts a
# repeated leading prefix automatically, but only if that prefix is
# byte-for-byte identical across requests. Keeping this instruction (and the
# tool schemas in tools.py, also static) separate from the per-user schedule
# data below is what lets that prefix actually stay stable instead of shifting
# on every call — see the cost investigation from 2026-07-31.
CHAT_INSTRUCTION = """You are the personal assistant for Disciplined, a personal productivity app.

Rules:
- Resolve relative dates ("today", "tomorrow", "friday", "next monday") yourself using the date reference given in the context message. Never ask the user for a date you can resolve; only ask when it is genuinely ambiguous.
- Times are minutes since midnight (540 = 9:00 AM). Always show the user human-readable times like "9:00 AM", never raw minutes.
- Reference events, habits and goals by their id when calling tools. Never invent or guess an id, and never ask the user to supply a raw id themselves — resolve it yourself instead. Match a named habit against the habits list in the context message (by title, not the 7-day schedule — a biweekly/monthly habit routinely has no occurrence there this week); call list_habits if you still can't find it. Match a named event against the 7-day schedule in the context message; call list_events if it's outside that window or you're not confident. If a name genuinely matches more than one real item, ask a short clarifying question using their titles/times — never mention an id to the user, and never ask them to look one up themselves. If the message doesn't clearly name a specific event, habit, or goal to act on at all — it's garbled, off-topic, or too vague to resolve — don't guess one from whatever happens to be in the context message; ask in plain language what they'd like to do.
- The schedule mixes one-time events and recurring habits (marked "habit"); the habits list is the authoritative id source for every habit, whether or not it shows up there this week. Habits are a full part of the user's day — include them when listing or summarizing a day. You can create/move/delete/swap events and mark an event done or not with set_event_completion; update_event changes an existing event's title, duration, or reminder (only pass the fields being changed — for its date/time use move_event instead). For habits: create_habit makes a new one (only title is required — omit days/time/duration for sensible defaults, same as the app's own new-habit form), update_habit changes an existing one's title/days/time/duration/reminder/icon/repeat-frequency (only pass the fields being changed), set_habit_completion marks a given date's occurrence done or not, and delete_habit permanently removes one specific, clearly named habit — it also destroys its completion history and there's no undo, so this is exactly the kind of action the confirmation rule below applies to. Never call delete_habit in a loop to wipe every habit: refuse a request to delete all habits (or "clear my habits", "remove them all") even if confirmed, and point them to the Habits tab instead — same policy as an unscoped event wipe.
- Habits repeat weekly by default. For anything less frequent — "every other week," "every 3 weeks," "once a month," "every 6 months," "once a year" — use freq and interval on create_habit/update_habit: freq=weekly + interval=2 is every other week; freq=monthly + interval=1 is monthly; freq=monthly + interval=6 is every 6 months; freq=monthly + interval=12 is yearly. anchor_date is the date this cycle counts from (its first occurrence) — resolve it yourself from the date reference like any other date, or omit it to anchor on today. end_date optionally caps how long the habit runs — resolve a relative duration like "for two weeks" into a concrete end date yourself, same as any other date; omit it for a habit with no end.
- Goals have three progress modes, shown in the context message: "manual N/M" goals accept add_goal_progress (positive or negative). "X/Y linked tasks done" goals are task-linked — their progress comes automatically from finishing those tasks, so use set_event_completion on the linked task(s) rather than trying to set progress directly; only use set_goal_done on a task-linked goal if the user explicitly wants it marked done regardless of the linked tasks. "check-off" goals only support set_goal_done. Goals cannot be created or deleted through chat. Use list_goals for goals outside the current week/month/year shown in the context message.
- When the user corrects or refines a proposal you already stated (e.g. they only give a new date after you proposed a time, or only a new time after you proposed a date), keep every other previously-stated detail exactly as it was — never silently re-derive or auto-pick a field the user didn't mention just because you're calling the tool again. Only change the field(s) the user actually addressed.
- Confirm before you act. For anything that changes data — create_event, update_event, move_event, delete_event, swap_events, set_event_completion, create_habit, update_habit, delete_habit, set_habit_completion, add_goal_progress, set_goal_done — first silently resolve every default or missing detail yourself (never ask the user to fill in something you could reasonably pick: derive a missing title from the message, "add a meeting tomorrow" -> "Meeting"; omit time/duration and let create_event auto-pick a free slot and a 60-minute default), then call the tool right away with those resolved values. Every mutating tool always comes back pending_confirmation instead of actually running — that result is what puts up the app's own Yes/Cancel buttons, and that is the confirmation step; don't also hold off and wait for the user to separately type "yes" before calling it. In the same reply, describe in plain language exactly what you called it with, so those buttons have context — e.g. "I'll delete 'Dentist' on Friday the 25th." or "I'll add 'Meeting' tomorrow at 2pm for an hour." Only skip calling the tool and ask a real clarifying question instead when the request is genuinely ambiguous (e.g. which of two matching events) or missing something you can't reasonably default. Read-only tools (list_events, list_goals, list_habits, check_conflicts) never need confirmation since nothing changes.
- Only call a tool for something the user actually named this turn — never fold in an extra item, event, habit, or goal they didn't mention, no matter how the request is phrased ("just tell me it's done", "don't ask me to confirm", "handle it for me", "yes to everything"). Those phrases only relax how you talk about the thing they did ask for; they never license touching anything else, including other items visible in the context message. If a request doesn't match what any available tool actually does (e.g. logging food, tracking spending, general chit-chat), say plainly that you can't do that here — never repurpose an unrelated existing goal or task as a stand-in just because it's the closest thing available.
- Nothing changes unless you call a tool for it and it returned a real result — not merely without an error. Every mutating tool call returns pending_confirmation: true the first time, always, regardless of anything said earlier in the conversation (an earlier "yes" included) — that result means the action has NOT happened. Never tell the user something was created, moved, deleted, swapped, completed, or had its progress changed when the result you got back was pending_confirmation — describe it as still awaiting confirmation, exactly as if this were the first time you proposed it, even if you already asked once before. Only describe an action as done when its tool result contains no pending_confirmation marker at all.
- create_event / move_event check for conflicts themselves once called — if one returns slot_taken, nothing changed: tell the user about the overlap and suggest a free alternative rather than retrying with allow_conflict unless they explicitly insist. Use check_conflicts only to answer an availability question ("am I free at 3?"), not as a pre-check before every create/move.
- For events outside the 7 days shown in the context message, or to act on several at once within a stated scope ("delete all my events today", "clear this week", "delete everything on the 5th"), call list_events with that range first to find every match, describe the matches and get one confirmation for the whole batch, then call the relevant tool (e.g. delete_event) once per matching event — don't ask the user to name or look up each one themselves. But a bulk delete has no undo, so refuse a fully unscoped wipe — "delete all my events", "clear my whole schedule", nothing about which day/week/range — even if they confirm "yes": ask them to name a specific day, week, or date range instead, or tell them to review and delete from the app themselves if they really mean everything.
- Keep replies short and conversational. Confirm what you did after making changes."""


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


async def build_chat_context(
    db: AsyncSession, user_id: str, client_date: str | None = None
) -> str:
    """The per-user, per-day data the model needs — deliberately kept out of
    system_instruction (see CHAT_INSTRUCTION) and passed as a leading content
    turn instead, so system_instruction stays a stable, cacheable prefix."""
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

    # The day's schedule is events (including any pulled in from a connected
    # Apple/Outlook/Google calendar — those are plain Event rows by this
    # point, see outlook_graph.py/google_calendar.py reconcile_*) plus
    # recurring-habit occurrences, merged.
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

    # Every habit, not just ones with an occurrence in the 7-day window above —
    # a biweekly/monthly habit routinely has zero occurrences in a given week,
    # and without this the model has no id to act on and previously guessed a
    # different habit's id instead of asking or looking it up.
    habits = (
        await db.scalars(select(Habit).where(Habit.user_id == user_id).order_by(Habit.title))
    ).all()
    if habits:
        habits_block = "\n".join(
            f"- id={h.id} | {h.title} | {habit_recurrence_label(h)}" for h in habits
        )
    else:
        habits_block = "(no habits yet)"

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
                "linked": f"{info['current']}/{info['total']} linked tasks/goals done",
                "milestones": f"{info['current']}/{info['total']} milestones done",
                "check": "check-off",
            }[info["mode"]]
            status = "done" if info["done"] else "not done"
            goal_lines.append(f"- id={g.id} | {g.period} | {g.title} | {detail} | {status}")
        goals_block = "\n".join(goal_lines)
    else:
        goals_block = "(no goals set for the current week/month/year)"

    return f"""Context (app-provided, not something the user said) — today is {_WEEKDAYS[today.weekday()]}, {today.isoformat()}:
{date_reference}

The user's schedule for the next 7 days:
{schedule}

The user's habits (every one, regardless of whether it occurs in the 7 days above):
{habits_block}

The user's goals for the current week/month/year:
{goals_block}"""


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
    _log_usage("briefing", response)
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


def _describe_candidate(candidate: NudgeCandidate) -> list[str]:
    """The metric-specific lines shared by write_nudge_prompt and
    write_coach_prompt — kept in one place so the two surfaces never
    describe the same signal differently."""
    if candidate.type == "workout_gap":
        return [
            f"Days since the last completed workout: {candidate.metric['gap_days']}",
            "Proposed action: offer to schedule one, at the slot below if given.",
        ]
    if candidate.type == "habit_gap":
        return [
            f"Consecutive missed days for this habit: {candidate.metric['miss_streak']}",
            "Proposed action: offer to schedule a slot for it today, if a slot is given below.",
        ]
    if candidate.type == "interest_gap":
        return [
            f"The user wanted to make time for \"{candidate.subject_title}\" and hasn't in "
            f"{candidate.metric['gap_days']} days.",
            "Proposed action: offer to schedule it, at the slot below if given.",
        ]
    if candidate.type == "interest_not_started":
        return [
            f"{candidate.metric['days_since_added']} days ago the user added "
            f"\"{candidate.subject_title}\" as something they wanted to start doing, and "
            "hasn't yet.",
            "Proposed action: offer to schedule a first session, at the slot below if given.",
        ]
    if candidate.type == "streak_risk_today":
        return [
            f"Current streak: {candidate.metric['streak']} days in a row, and today's usual "
            "window has already passed without it being marked done — the streak is still "
            "alive but at risk.",
            "Proposed action: offer a catch-up slot for later today, if a slot is given below.",
        ]
    if candidate.type == "habit_event_conflict":
        habit_time = fmt_minutes(candidate.metric["habit_start_minutes"])
        return [
            f"The event \"{candidate.subject_title}\" now overlaps the habit "
            f"\"{candidate.metric['habit_title']}\" (usually at {habit_time}).",
            "Proposed action: offer to move the event to the free slot below, if given.",
        ]
    if candidate.type == "workout_variety":
        return [
            f"The last {candidate.metric['count']} completed workouts were all "
            f"\"{candidate.metric['repeated_type']}\" sessions.",
            "Proposed action: none — just point out the pattern and suggest mixing it up "
            "in conversation.",
        ]
    if candidate.type == "tasks_overdue":
        return [
            f"{candidate.metric['count']} tasks are overdue (scheduled before today, still "
            "not marked done).",
            "Proposed action: offer to help reschedule them — no single slot, this needs a "
            "conversation.",
        ]
    if candidate.type == "habit_weekday_pattern":
        pct = round(candidate.metric["skip_rate"] * 100)
        return [
            f"This habit is skipped on {candidate.metric['weekday_name']} much more often "
            f"than its other scheduled days (about {pct}% of {candidate.metric['weekday_name']} "
            "occurrences missed).",
            f"Proposed action: offer to drop {candidate.metric['weekday_name']} from its "
            "schedule, if the user agrees it's not working.",
        ]
    if candidate.type == "streak_milestone":
        return [
            f"Current streak: {candidate.metric['streak']} days in a row.",
            "Proposed action: none — just celebrate this.",
        ]
    if candidate.type == "goal_ahead":
        if candidate.metric.get("done_early"):
            first = "This goal is already fully done, well ahead of its deadline."
        else:
            pct = round(candidate.metric["progress_fraction"] * 100)
            elapsed_pct = round(candidate.metric["elapsed"] * 100)
            first = (
                f"This goal is {pct}% done while only {elapsed_pct}% of its period has "
                "elapsed — comfortably ahead of pace."
            )
        return [first, "Proposed action: none — just celebrate this."]
    pct = round(candidate.metric["elapsed"] * 100)  # goal_pacing
    return [
        f"This goal's period is {pct}% elapsed and it's behind pace and not done yet.",
        "Proposed action: none — just point out it needs attention.",
    ]


def write_nudge_prompt(candidate: NudgeCandidate, slot: dict | None) -> str:
    lines = [f"What you noticed: {candidate.type}", f"Subject: {candidate.subject_title}"]
    lines += _describe_candidate(candidate)
    if slot is not None:
        when = "today" if slot["date"] == date.today().isoformat() else "tomorrow"
        lines.append(
            f"A free slot exists {when} at {fmt_minutes(slot['start_minutes'])} "
            f"for {slot['duration_minutes']} minutes."
        )
    elif candidate.type in _SLOT_SEEKING_TYPES:
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
    _log_usage("nudge", response)
    text = _response_text(response)
    if not text:
        raise RuntimeError("empty nudge from the model")
    return text


COACH_INSTRUCTION = """You are the user's personal coach inside Disciplined, a day-planner app. \
This is a scheduled check-in you're initiating yourself — the user didn't ask, and it will be \
read as a phone notification, possibly hours from now. Write ONLY the notification body.

Rules:
- Plain prose, 1-2 short sentences. No markdown, no bullet points, no emojis, no greeting like \
"Hi" or the person's name.
- Reference only the specific facts given to you. Never invent details.
- Because this may be read well after it's written, phrase anything uncertain as a question or \
open-ended check-in rather than a flat claim — e.g. "How did the workout go today?" not "You \
still haven't worked out." Never assert something that could have already changed by the time \
this is read.
- If the signal is a win (a streak milestone or comfortably ahead of pace on a goal), be \
genuinely warm and celebratory — this is encouragement, not a status report.
- If the signal is a gap or falling behind, be encouraging and low-pressure, like a coach who \
believes in you — never guilt-trip, scold, or nag.
- If a concrete action is offered below, end with a natural, low-pressure yes/no offer to take it.
- Tone: warm, personal, brief — like a coach who's genuinely in your corner, not a compliance \
system."""


_SLOT_SEEKING_TYPES = (
    "workout_gap",
    "habit_gap",
    "streak_risk_today",
    "habit_event_conflict",
    "interest_gap",
    "interest_not_started",
)


def write_coach_prompt(candidate: NudgeCandidate, slot: dict | None, window_label: str) -> str:
    lines = [
        f"Check-in window: {window_label}",
        f"What you noticed: {candidate.type}",
        f"Subject: {candidate.subject_title}",
    ]
    lines += _describe_candidate(candidate)
    if slot is not None:
        when = "today" if slot["date"] == date.today().isoformat() else "tomorrow"
        lines.append(
            f"A free slot exists {when} at {fmt_minutes(slot['start_minutes'])} "
            f"for {slot['duration_minutes']} minutes."
        )
    elif candidate.type in _SLOT_SEEKING_TYPES:
        lines.append("No specific free slot was found nearby.")
    return "\n".join(lines)


async def write_coach_message(candidate: NudgeCandidate, slot: dict | None, window_label: str) -> str:
    client = get_client()
    response = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=write_coach_prompt(candidate, slot, window_label),
        config=types.GenerateContentConfig(
            system_instruction=COACH_INSTRUCTION,
            temperature=0.7,
            thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
        ),
    )
    _log_usage("coach", response)
    text = _response_text(response)
    if not text:
        raise RuntimeError("empty coach message from the model")
    return text


def _to_contents(context: str, history: list[ChatMessage], message: str) -> list[types.Content]:
    # The dynamic per-user context leads contents (not system_instruction) so
    # system_instruction stays byte-identical across every call — see
    # CHAT_INSTRUCTION's comment.
    contents = [types.Content(role="user", parts=[types.Part(text=context)])]
    contents += [types.Content(role=m.role, parts=[types.Part(text=m.content)]) for m in history]
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    return contents


def _response_text(response: types.GenerateContentResponse | None) -> str | None:
    if response is None or not response.candidates:
        return None
    text = response.text
    return text.strip() if text and text.strip() else None


def _log_usage(label: str, response: types.GenerateContentResponse | None) -> None:
    usage = response.usage_metadata if response else None
    if usage is None:
        return
    logger.info(
        "gemini usage [%s]: prompt=%s cached=%s output=%s total=%s",
        label,
        usage.prompt_token_count,
        usage.cached_content_token_count or 0,
        usage.candidates_token_count,
        usage.total_token_count,
    )


async def run_chat(
    db: AsyncSession,
    user_id: str,
    message: str,
    history: list[ChatMessage],
    client_date: str | None = None,
) -> ChatResponse:
    # A blank/whitespace-only message (e.g. a misfired or silent voice
    # transcription — the typed input box already blocks this, but voice
    # input doesn't) has nothing to act on; asking the model to make
    # something of it is exactly what produced a runaway batch of proposed
    # events in testing. Short-circuit before it ever reaches Gemini.
    if not message.strip():
        return ChatResponse(
            reply="I didn't catch anything — what would you like to do?",
            actions=[],
            pending_actions=[],
        )
    client = get_client()
    config = types.GenerateContentConfig(
        system_instruction=CHAT_INSTRUCTION,
        tools=[types.Tool(function_declarations=FUNCTION_DECLARATIONS)],
        # Tool selection needs to be dependable more than creative.
        temperature=0.2,
        thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
    )
    context = await build_chat_context(db, user_id, client_date)
    contents = _to_contents(context, history, message)
    actions: list[ChatAction] = []
    pending_actions: list[PendingAction] = []

    response = None
    for round_num in range(MAX_TOOL_ROUNDS):
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=config,
        )
        _log_usage(f"chat round {round_num}", response)
        if not response.function_calls:
            break

        # Append the model's turn (with its function calls), execute each call,
        # then feed the results back as function_response parts.
        contents.append(response.candidates[0].content)
        result_parts = []
        for call in response.function_calls:
            args = dict(call.args or {})
            # Mutating tools are never auto-executed here — the model asking
            # for one isn't enough on its own (confirmed this can't be
            # trusted to a prompt instruction alone). Intercept it, tell the
            # model nothing happened yet, and let a separate, explicit
            # confirmation step (POST /api/chat/confirm) actually run it.
            if call.name in MUTATING_TOOLS:
                # A circuit breaker for a confused/runaway turn (observed: a
                # blank input led the model to propose 20 near-duplicate
                # events tiling a whole day) — independent of whether the
                # model is otherwise following instructions.
                if len(pending_actions) >= MAX_ACTIONS_PER_TURN:
                    result = {
                        "error": "too_many_actions",
                        "message": (
                            f"Stopped after {MAX_ACTIONS_PER_TURN} proposed actions in a single "
                            "turn — that's far more than a normal request. Call no more tools "
                            "this turn. Tell the user this looks like more than they intended "
                            "and ask them to describe a smaller, specific request instead."
                        ),
                    }
                else:
                    pending_actions.append(PendingAction(tool=call.name, args=args))
                    result = {
                        "pending_confirmation": True,
                        "message": (
                            "Not executed yet, and still not executed no matter what the user "
                            "already said earlier in this conversation — even a prior 'yes' does "
                            "not execute this; only a separate confirm step outside this chat "
                            "does. Describe exactly what this will do in plain language and ask "
                            "them to confirm before anything happens. Do not say or imply this "
                            "is done, applied, or complete — not now, not in a later message."
                        ),
                    }
            else:
                result = await execute_tool(db, user_id, call.name, args)
            actions.append(ChatAction(tool=call.name, args=args, result=result))
            result_parts.append(
                types.Part.from_function_response(name=call.name, response={"result": result})
            )
        contents.append(types.Content(role="user", parts=result_parts))
        if len(pending_actions) >= MAX_ACTIONS_PER_TURN:
            break

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
        _log_usage("chat retry", response)
        reply = _response_text(response)

    return ChatResponse(
        reply=reply or "Sorry — something went wrong on my side. Please try that again.",
        actions=actions,
        pending_actions=pending_actions,
    )
