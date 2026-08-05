from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import CalendarEventOut, CalendarSyncRequest, CalendarSyncResponse
from app.services.calendar_sync import list_calendar_events, sync_calendar_events

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.post("/sync", response_model=CalendarSyncResponse)
async def sync(
    body: CalendarSyncRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upserts one device calendar's events for the given window; called by
    the frontend on app foreground and after the user changes which
    calendars are connected. One-way — nothing here is ever pushed back to
    the device."""
    synced, pruned = await sync_calendar_events(db, user.id, body)
    return CalendarSyncResponse(synced=synced, pruned=pruned)


@router.get("/events", response_model=list[CalendarEventOut])
async def events(
    start: str,
    end: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Read-only — used by the timeline to render external events without
    waiting on the next device sync pass."""
    return await list_calendar_events(db, user.id, start, end)
