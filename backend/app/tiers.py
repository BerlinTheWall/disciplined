"""Subscription-tier gating for whole features — one reusable dependency
instead of each router improvising its own tier check (or, as of
2026-09-03, no router checking at all: chat/tts/nudges/week_plan/goal_*
had zero tier enforcement despite the Free/Plus/Pro feature split being
fully designed).

No billing exists yet, so every account defaults to "pro" (see
User.subscription_tier) — nothing is actually blocked today. This exists so
turning real tiers on later is flipping that default and writing to the
column per subscription, not building the enforcement from scratch.
"""

from fastapi import Depends, HTTPException

from app.auth import get_current_user
from app.models import User

_TIER_RANK = {"free": 0, "plus": 1, "pro": 2}


def require_tier(minimum: str):
    """Dependency factory: use as `user: User = Depends(require_tier("plus"))`
    in place of `Depends(get_current_user)` on any route that should be
    unavailable below that tier. Raises 403, not 401 — the caller is
    correctly authenticated, just not entitled to this feature yet."""

    async def dependency(user: User = Depends(get_current_user)) -> User:
        if _TIER_RANK.get(user.subscription_tier, 0) < _TIER_RANK[minimum]:
            raise HTTPException(
                status_code=403,
                detail=f"This feature requires the {minimum} plan or higher.",
            )
        return user

    return dependency
