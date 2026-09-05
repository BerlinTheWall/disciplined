import logging

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors

from app.models import User
from app.schemas import GoalDescriptionRequest, GoalDescriptionResponse
from app.services.goal_description import generate_description
from app.tiers import require_tier

router = APIRouter(prefix="/api/goal-description", tags=["goal-description"])
logger = logging.getLogger("uvicorn.error")


@router.post("/generate", response_model=GoalDescriptionResponse)
async def generate(
    body: GoalDescriptionRequest,
    user: User = Depends(require_tier("plus")),
):
    """Drafts a description for a goal. Nothing is written here — the client
    keeps whatever the user accepts through the normal goal endpoints, same
    as a description typed in by hand."""
    try:
        description = await generate_description(
            title=body.title,
            category=body.category,
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
        logger.exception("goal-description Gemini error")
        raise HTTPException(status_code=502, detail=f"Gemini error {exc.code} — please try again.")
    except Exception:
        logger.exception("goal description generation failed")
        raise HTTPException(status_code=502, detail="Couldn't draft a description — please try again.")

    return GoalDescriptionResponse(description=description)
