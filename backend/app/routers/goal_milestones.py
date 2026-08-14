import logging

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors

from app.auth import get_current_user
from app.models import User
from app.schemas import MilestoneSuggestRequest, MilestoneSuggestResponse
from app.services.goal_milestones import suggest_milestones

router = APIRouter(prefix="/api/goal-milestones", tags=["goal-milestones"])
logger = logging.getLogger("uvicorn.error")


@router.post("/suggest", response_model=MilestoneSuggestResponse)
async def suggest(
    body: MilestoneSuggestRequest,
    user: User = Depends(get_current_user),
):
    """Proposes milestones for a goal. Nothing is written here — the client
    adds whatever the user accepts through the normal goal endpoints, same
    as a milestone typed in by hand."""
    try:
        milestones = await suggest_milestones(
            title=body.title,
            description=body.description,
            category=body.category,
            note=body.note,
            period=body.period,
            duration_count=body.duration_count,
        )
    except RuntimeError as exc:  # missing API key
        raise HTTPException(status_code=503, detail=str(exc))
    except genai_errors.APIError as exc:
        if exc.code == 429:
            raise HTTPException(
                status_code=429,
                detail="The assistant hit the Gemini rate limit — wait a minute and try again.",
            )
        logger.exception("goal-milestones Gemini error")
        raise HTTPException(status_code=502, detail=f"Gemini error {exc.code} — please try again.")
    except Exception:
        logger.exception("milestone suggestion failed")
        raise HTTPException(status_code=502, detail="Couldn't suggest milestones — please try again.")

    return MilestoneSuggestResponse(milestones=milestones)
