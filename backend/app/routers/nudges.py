import logging

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import NudgeRequest, NudgeResponse, NudgeSuggestedSlot
from app.services.gemini import resolve_today, write_nudge
from app.services.nudges import build_action_phrase, evaluate, suggest_evening_slot

router = APIRouter(prefix="/api/nudges", tags=["nudges"])
logger = logging.getLogger("uvicorn.error")


@router.post("/check", response_model=NudgeResponse)
async def check_nudge(
    body: NudgeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Deterministic signal check first (cheap) — only calls Gemini if a
    candidate is actually found, so a quiet day costs nothing."""
    today = resolve_today(body.client_date)
    candidate = await evaluate(db, user.id, today, set(body.excluded_keys))
    if candidate is None:
        return NudgeResponse()

    slot = None
    if candidate.type in ("habit_gap", "workout_gap"):
        slot = await suggest_evening_slot(db, user.id, today, body.now_minutes)

    try:
        message = await write_nudge(candidate, slot)
    except RuntimeError as exc:  # missing API key / empty model reply
        raise HTTPException(status_code=503, detail=str(exc))
    except genai_errors.APIError as exc:
        logger.exception("nudge Gemini error")
        raise HTTPException(status_code=502, detail=f"Nudge failed ({exc.code}).")

    return NudgeResponse(
        type=candidate.type,
        subject_id=candidate.subject_id,
        message=message,
        action_phrase=build_action_phrase(candidate, slot, today),
        suggested_slot=NudgeSuggestedSlot(**slot) if slot else None,
    )
