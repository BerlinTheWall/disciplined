from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.schemas import CoachCheckpoint, CoachPlanRequest, CoachPlanResponse, PendingAction
from app.services.coach import CoachWindowInput, plan_checkpoints
from app.services.gemini import resolve_today
from app.tiers import require_tier

router = APIRouter(prefix="/api/coach", tags=["coach"])


@router.post("/plan", response_model=CoachPlanResponse)
async def plan(
    body: CoachPlanRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_tier("pro")),
):
    """Stateless: the client always proposes today's remaining check-in
    windows; how many actually get filled is decided here by the user's
    subscription_tier, so the client never needs to know about tiering at
    all."""
    today = resolve_today(body.client_date)
    windows = [
        CoachWindowInput(label=w.label, start_minutes=w.start_minutes, end_minutes=w.end_minutes)
        for w in body.windows
    ]
    checkpoints = await plan_checkpoints(db, user, today, body.now_minutes, windows)
    return CoachPlanResponse(
        checkpoints=[
            CoachCheckpoint(
                window_label=c.window_label,
                fire_at_minutes=c.fire_at_minutes,
                title=c.title,
                body=c.body,
                action_phrase=c.action_phrase,
                pending_action=PendingAction(**c.pending_action) if c.pending_action else None,
                subject_key=c.subject_key,
            )
            for c in checkpoints
        ]
    )
