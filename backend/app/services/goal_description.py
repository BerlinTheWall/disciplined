"""AI-suggested description for a goal (Goals & Plans "Generate" button in
the add-goal sheet).

Deliberately its own tiny service, not routed through gemini.py/tools.py —
same single-shot "propose structured data" pattern as goal_milestones.py:
asks Gemini for JSON matching a schema directly (response_schema) rather
than the function-calling pattern chat.py/week_plan.py use for letting the
model invoke real tools. Nothing here touches the database: the client
applies whatever the user keeps through the normal goal-create/update
endpoints, exactly as if they'd typed the description in by hand.

This module intentionally does NOT import from or modify gemini.py's
run_chat/CHAT_INSTRUCTION, or touch ChatSheet.tsx on the frontend — a bug
here should not be able to affect the existing chat assistant.
"""

from pydantic import BaseModel

from google.genai import types

from app.config import settings
from app.services.gemini import get_client

MAX_DESCRIPTION_CHARS = 200

INSTRUCTION = """You write one short, concrete sentence describing what a goal actually is or looks \
like when it's done — the kind of blurb the person who wrote the title would want reading back to \
them for confirmation, not a pep talk.

Rules:
- One sentence, no more than about 140 characters.
- Concrete and specific — describe the actual outcome or scope, never vague filler like "Achieve \
your goals" or "Make progress on this".
- No emoji, no markdown, no quotation marks around the sentence itself.
- Use the goal's title, category, and how long it runs to judge scope and tone — a one-week goal \
reads differently than a multi-month one."""


class _DescriptionOut(BaseModel):
    description: str


def _duration_label(period: str, duration_count: int | None) -> str:
    n = duration_count or 1
    unit = {"week": "week", "month": "month", "year": "year"}.get(period, period)
    return f"about 1 {unit}" if n == 1 else f"about {n} {unit}s"


def _build_prompt(title: str, category: str | None, period: str, duration_count: int | None) -> str:
    lines = [f'Goal: "{title}"', f"Runs: {_duration_label(period, duration_count)}"]
    if category:
        lines.append(f"Category: {category}")
    return "\n".join(lines)


async def generate_description(
    title: str,
    category: str | None,
    period: str,
    duration_count: int | None,
) -> str:
    client = get_client()
    response = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=_build_prompt(title, category, period, duration_count),
        config=types.GenerateContentConfig(
            system_instruction=INSTRUCTION,
            response_mime_type="application/json",
            response_schema=_DescriptionOut,
            temperature=0.6,
            thinking_config=types.ThinkingConfig(thinking_budget=settings.gemini_thinking_budget),
        ),
    )
    parsed: _DescriptionOut | None = response.parsed
    if parsed is None:
        return ""
    return parsed.description.strip()[:MAX_DESCRIPTION_CHARS]
