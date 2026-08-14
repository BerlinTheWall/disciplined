"""AI-suggested milestones for a goal (Goals & Plans "Milestone" action).

Deliberately its own tiny service, not routed through gemini.py/tools.py —
this is a single-shot "propose structured data" call, not an agentic loop
with real side effects, so it asks Gemini for JSON matching a schema
directly (response_schema) instead of the function-calling pattern
chat.py/week_plan.py use for letting the model invoke real tools. Nothing
here touches the database: the client applies whatever the user accepts
through the normal goal store actions, exactly as if they'd typed the
milestones in by hand.

This module intentionally does NOT import from or modify gemini.py's
run_chat/CHAT_INSTRUCTION, or touch ChatSheet.tsx on the frontend — a bug
here should not be able to affect the existing chat assistant.
"""

from pydantic import BaseModel, Field

from google.genai import types

from app.config import settings
from app.services.gemini import get_client

MAX_MILESTONES = 8

INSTRUCTION = """You break a goal down into a short, ordered list of concrete milestones — the \
handful of phases someone would actually move through to get it done, in the order they'd happen.

Rules:
- 3 to 6 milestones for most goals; fewer (2-3) for a short one-week goal, more (up to 6) only for \
a genuinely multi-month goal with distinct phases.
- Each label is short and concrete — a phase or deliverable ("Draft the outline", "First round of \
edits"), never a full sentence and never vague filler like "Get started" or "Work on it".
- Never generate a "choose/pick/decide" milestone when the goal already names a specific target \
(a particular book, instrument, destination, etc.) — start from the work itself, not from picking it.
- If a concrete quantity is given anywhere in the goal (pages, chapters, words, reps, dollars, \
distance, etc.), split the work by that quantity into even, checkable chunks with the number in the \
label (e.g. "Read pages 1-100", not "Read the first half") instead of a vague narrative split.
- Every milestone must be genuinely distinct work — never split the same underlying task across two \
milestones (e.g. a last reading/writing chunk and then a separate "finish it" step that covers the \
same ground).
- Order them chronologically — the sequence someone would actually do them in.
- Weight is optional per milestone: a whole number percent (0-100) of the goal's total effort. Only \
set it when a step clearly takes noticeably more or less effort than the others (e.g. "Write the \
draft" on a thesis is obviously worth more than "Pick a title") — omit it for milestones that should \
just split whatever's left evenly, which is the right choice most of the time. Never force weights \
to sum to exactly 100; that happens automatically for you.
- Use the goal's own title, description, category, why/note, and how long it runs to judge scope and \
tone — a one-week goal doesn't need month-scale phases, and a goal marked "chore" doesn't need the \
same ceremony as a "personal" growth goal."""


class _MilestoneItem(BaseModel):
    label: str = Field(description="A short, concrete, actionable phase — not a full sentence.")
    weight: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description=(
            "This milestone's percent (0-100) of the whole goal. Omit unless it clearly "
            "dominates or is clearly smaller than the others — omitted milestones split "
            "whatever's left evenly."
        ),
    )


class _MilestonePlan(BaseModel):
    milestones: list[_MilestoneItem]


def _duration_label(period: str, duration_count: int | None) -> str:
    n = duration_count or 1
    unit = {"week": "week", "month": "month", "year": "year"}.get(period, period)
    return f"about 1 {unit}" if n == 1 else f"about {n} {unit}s"


def _build_prompt(
    title: str,
    description: str | None,
    category: str | None,
    note: str | None,
    period: str,
    duration_count: int | None,
) -> str:
    lines = [f'Goal: "{title}"', f"Runs: {_duration_label(period, duration_count)}"]
    if description:
        lines.append(f'Description: "{description}"')
    if category:
        lines.append(f"Category: {category}")
    if note:
        lines.append(f'Why this matters to the user: "{note}"')
    return "\n".join(lines)


async def suggest_milestones(
    title: str,
    description: str | None,
    category: str | None,
    note: str | None,
    period: str,
    duration_count: int | None,
) -> list[_MilestoneItem]:
    client = get_client()
    response = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=_build_prompt(title, description, category, note, period, duration_count),
        config=types.GenerateContentConfig(
            system_instruction=INSTRUCTION,
            response_mime_type="application/json",
            response_schema=_MilestonePlan,
            temperature=0.5,
            thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
        ),
    )
    plan: _MilestonePlan | None = response.parsed
    if plan is None:
        return []

    milestones = plan.milestones[:MAX_MILESTONES]
    # Defensive clamp — the schema already constrains this, but a model can
    # still drift outside it in practice.
    for m in milestones:
        if m.weight is not None:
            m.weight = max(0, min(100, m.weight))
    return milestones
