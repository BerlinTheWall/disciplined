import logging

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import WeekPlanRequest, WeekPlanResponse
from app.services.week_plan import generate_week_plan

router = APIRouter(prefix="/api/week-plan", tags=["week-plan"])
logger = logging.getLogger("uvicorn.error")


@router.post("", response_model=WeekPlanResponse)
async def week_plan(
    body: WeekPlanRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Drafts a week's worth of proposed events. Nothing is written here —
    the client sends the returned pending_actions to POST /api/chat/confirm
    to actually create them, same as any chat-proposed action."""
    try:
        return await generate_week_plan(db, user.id, body.preferences, body.client_date)
    except RuntimeError as exc:  # missing API key
        raise HTTPException(status_code=503, detail=str(exc))
    except genai_errors.APIError as exc:
        if exc.code == 429:
            raise HTTPException(
                status_code=429,
                detail="The assistant hit the Gemini rate limit — wait a minute and try again.",
            )
        logger.exception("week-plan Gemini error")
        raise HTTPException(status_code=502, detail=f"Gemini error {exc.code} — please try again.")
    except Exception:
        logger.exception("week plan generation failed")
        raise HTTPException(status_code=502, detail="Couldn't plan your week — please try again.")
