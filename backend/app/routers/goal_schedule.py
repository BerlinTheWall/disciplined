import logging

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import GoalScheduleRequest, GoalScheduleResponse
from app.services.goal_schedule import schedule_goal_milestones

router = APIRouter(prefix="/api/goal-schedule", tags=["goal-schedule"])
logger = logging.getLogger("uvicorn.error")


@router.post("", response_model=GoalScheduleResponse)
async def goal_schedule(
    body: GoalScheduleRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Drafts calendar sessions for a goal's milestones. Nothing is written
    here — the client sends the returned proposals' actions to
    POST /api/chat/confirm to actually create them, same as any chat-proposed
    action, then links whatever was created to its milestone locally."""
    try:
        return await schedule_goal_milestones(
            db, user.id, body.goal_title, body.milestones, body.client_date
        )
    except RuntimeError as exc:  # missing API key
        raise HTTPException(status_code=503, detail=str(exc))
    except genai_errors.APIError as exc:
        if exc.code == 429:
            raise HTTPException(
                status_code=429,
                detail="The assistant hit the Gemini rate limit — wait a minute and try again.",
            )
        logger.exception("goal-schedule Gemini error")
        raise HTTPException(status_code=502, detail=f"Gemini error {exc.code} — please try again.")
    except Exception:
        logger.exception("goal schedule generation failed")
        raise HTTPException(status_code=502, detail="Couldn't schedule that goal — please try again.")
