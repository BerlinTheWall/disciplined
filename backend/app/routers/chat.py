import logging

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import ChatRequest, ChatResponse
from app.services.gemini import run_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger("uvicorn.error")


@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return await run_chat(db, user.id, body.message, body.history, body.client_date)
    except RuntimeError as exc:  # missing API key
        raise HTTPException(status_code=503, detail=str(exc))
    except genai_errors.APIError as exc:
        if exc.code == 429:
            raise HTTPException(
                status_code=429,
                detail="The assistant hit the Gemini rate limit — wait a minute and try again.",
            )
        logger.exception("Gemini API error")
        raise HTTPException(status_code=502, detail=f"Gemini error {exc.code} — please try again.")
    except Exception:
        logger.exception("chat turn failed")
        raise HTTPException(status_code=502, detail="The assistant failed — please try again.")
