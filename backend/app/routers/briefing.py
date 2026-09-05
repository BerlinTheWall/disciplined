import logging

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors

from app.models import User
from app.schemas import BriefingRequest, BriefingResponse
from app.services.gemini import write_briefing
from app.tiers import require_tier

router = APIRouter(prefix="/api/briefing", tags=["briefing"])
logger = logging.getLogger("uvicorn.error")


@router.post("", response_model=BriefingResponse)
async def briefing(body: BriefingRequest, user: User = Depends(require_tier("plus"))):
    """LLM-written spoken briefing for a day's schedule. The client falls back
    to its local template script when this fails."""
    try:
        return BriefingResponse(script=await write_briefing(body))
    except RuntimeError as exc:  # missing API key / empty model reply
        raise HTTPException(status_code=503, detail=str(exc))
    except genai_errors.APIError as exc:
        logger.exception("briefing Gemini error")
        raise HTTPException(status_code=502, detail=f"Briefing failed ({exc.code}).")
    except Exception:
        logger.exception("briefing failed")
        raise HTTPException(status_code=502, detail="Briefing failed.")
