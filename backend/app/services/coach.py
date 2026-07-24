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
    NudgeCandidate,
    build_action_phrase,
    goal_ahead_candidates,
    goal_pacing_candidates,
    habit_gap_candidates,
    streak_milestone_candidates,
    suggest_slot_for_candidate,
    workout_gap_candidate,
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
    "workout_gap": "Workout check-in",
    "habit_gap": "Habit check-in",
    "goal_pacing": "Goal check-in",
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
    subject_key: str


def _candidate_priority(c: NudgeCandidate) -> tuple[int, float]:
    """Positive signals lead — a coach that only ever raises problems stops
    feeling like encouragement — then the worst deficit first within each
    remaining category."""
    if c.type == "streak_milestone":
        return (0, -c.metric["streak"])
    if c.type == "goal_ahead":
        return (1, -c.metric.get("lead", 1 - c.metric["elapsed"]))
    if c.type == "workout_gap":
        return (2, -c.metric["gap_days"])
    if c.type == "habit_gap":
        return (3, -c.metric["miss_streak"])
    return (4, -c.metric["margin"])  # goal_pacing


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

    candidates: list[NudgeCandidate] = []
    candidates += await habit_gap_candidates(db, user.id, today)
    candidates += await goal_pacing_candidates(db, user.id, today)
    candidates += await streak_milestone_candidates(db, user.id, today)
    candidates += await goal_ahead_candidates(db, user.id, today)
    workout = await workout_gap_candidate(db, user.id, today)
    if workout is not None:
        candidates.append(workout)
    if not candidates:
        return []

    candidates.sort(key=_candidate_priority)

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
                subject_key=subject_key,
            )
        )
    return results
