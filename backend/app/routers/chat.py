import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ChatUsage, User
from app.schemas import ChatRequest, ChatResponse, ConfirmRequest, ConfirmResponse
from app.services.gemini import run_chat
from app.services.tools import execute_tool
from app.tiers import require_tier

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger("uvicorn.error")

# Daily chat-turn cap by subscription tier (see models.ChatUsage) — H3:
# before this, /api/chat had no rate limiting at all despite being the
# single largest AI cost driver in the app. Sized against a deliberately
# extreme "high usage" persona that only needed 5/day; no billing exists
# yet, so every account resolves to "pro" via User.subscription_tier's own
# default. "free" is unreachable in practice: this route is gated at
# require_tier("plus").
_DAILY_CHAT_QUOTA = {"free": 0, "plus": 20, "pro": 30}
_DEFAULT_TIER = "pro"


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _chat_quota_ok(db: AsyncSession, user: User) -> bool:
    quota = _DAILY_CHAT_QUOTA.get(user.subscription_tier, _DAILY_CHAT_QUOTA[_DEFAULT_TIER])
    usage = await db.get(ChatUsage, (user.id, _today()))
    used = usage.count if usage else 0
    return used < quota


async def _record_chat_usage(db: AsyncSession, user: User) -> None:
    today = _today()
    usage = await db.get(ChatUsage, (user.id, today))
    if usage is None:
        db.add(ChatUsage(user_id=user.id, date=today, count=1))
    else:
        usage.count += 1
    await db.commit()


@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_tier("plus")),
):
    # Checked before spending money, recorded only after a successful
    # turn — a failed call (bad key, Gemini error) shouldn't burn the quota.
    if not await _chat_quota_ok(db, user):
        raise HTTPException(
            status_code=429,
            detail="Daily chat limit reached — resets tomorrow.",
        )
    try:
        result = await run_chat(db, user.id, body.message, body.history, body.client_date)
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
    await _record_chat_usage(db, user)
    return result


@router.post("/confirm", response_model=ConfirmResponse)
async def confirm_actions(
    body: ConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_tier("plus")),
):
    """The only path that actually executes a mutating tool the assistant
    proposed — deliberately doesn't touch Gemini at all, so there's no model
    judgment involved in whether this runs, only whatever the client already
    confirmed. Gated at the lowest tier with any tool-producing feature
    (plus) rather than per-tool: a Pro-only source (nudges, week-plan) never
    hands a lower tier a pending_action to confirm in the first place, so
    that's already enforced upstream, not here."""
    results = [await execute_tool(db, user.id, a.tool, a.args) for a in body.actions]
    ok = not any(isinstance(r, dict) and "error" in r for r in results)
    return ConfirmResponse(results=results, ok=ok)
