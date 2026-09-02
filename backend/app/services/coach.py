"""Proactive coach planning: fills a day's worth of check-in windows with
LLM-composed messages, scheduled client-side as local notifications so they
reach the user even when the app is closed (see frontend/src/lib/coach.ts).

Reuses nudges.py's deterministic candidate detection — this module's only
job is picking which candidate goes in which window, within a per-user
budget, and turning each into an actual message via Gemini."""

import logging
from dataclasses import dataclass
from datetime import date

from google.genai import errors as genai_errors
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services.gemini import write_coach_message
from app.services.nudges import (
    all_candidates,
    build_action_phrase,
    build_pending_action,
    candidate_priority,
    suggest_slot_for_candidate,
)

logger = logging.getLogger("uvicorn.error")

# No billing exists yet (see User.coach_tier); this is the whole seam real
# subscriptions will plug into later — upgrading a user is just changing
# their column, not touching this budget map.
TIER_BUDGET = {"free": 1, "plus": 3}
DEFAULT_TIER = "plus"

_TITLES = {
    "streak_milestone": "Streak milestone",
    "goal_ahead": "Ahead of pace",
    "habit_gap": "Habit check-in",
    "goal_pacing": "Goal check-in",
    "streak_risk_today": "Streak at risk",
    "habit_event_conflict": "Schedule conflict",
    "tasks_overdue": "Overdue tasks",
    "habit_weekday_pattern": "Pattern noticed",
    "interest_gap": "Activity check-in",
    "interest_not_started": "Something to try",
}


@dataclass
class CoachWindowInput:
    label: str
    start_minutes: int
    end_minutes: int


@dataclass
class CoachCheckpointResult:
    window_label: str
    fire_at_minutes: int
    title: str
    body: str
    action_phrase: str | None
    pending_action: dict | None
    subject_key: str


async def plan_checkpoints(
    db: AsyncSession,
    user: User,
    today: date,
    now_minutes: int,
    windows: list[CoachWindowInput],
) -> list[CoachCheckpointResult]:
    budget = TIER_BUDGET.get(user.coach_tier, TIER_BUDGET[DEFAULT_TIER])
    open_windows = [w for w in windows if w.end_minutes > now_minutes][:budget]
    if not open_windows:
        return []

    candidates = await all_candidates(db, user.id, today, now_minutes)
    if not candidates:
        return []

    candidates.sort(key=candidate_priority)

    results: list[CoachCheckpointResult] = []
    seen: set[str] = set()
    for window, candidate in zip(open_windows, candidates):
        subject_key = f"{candidate.type}:{candidate.subject_id}"
        if subject_key in seen:
            continue
        seen.add(subject_key)

        fire_at = max(window.start_minutes, now_minutes + 5)
        fire_at = min(fire_at, max(window.end_minutes - 1, window.start_minutes))

        # Slots are checked against fire_at, not now_minutes — this is
        # composed now but read at fire_at, possibly hours from now, so
        # "is this time still in the future" has to mean future-relative-to
        # -delivery, not future-relative-to-compute-time.
        slot = await suggest_slot_for_candidate(db, user.id, candidate, today, fire_at)
        try:
            body = await write_coach_message(candidate, slot, window.label)
        except (RuntimeError, genai_errors.APIError):
            logger.exception("coach message compose failed for %s", subject_key)
            continue  # one failed compose shouldn't drop the rest of the plan
        results.append(
            CoachCheckpointResult(
                window_label=window.label,
                fire_at_minutes=fire_at,
                title=_TITLES.get(candidate.type, "Coach check-in"),
                body=body,
                action_phrase=build_action_phrase(candidate, slot, today),
                pending_action=build_pending_action(candidate, slot, today),
                subject_key=subject_key,
            )
        )
    return results
