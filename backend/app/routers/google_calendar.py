import logging

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import (
    GoogleCalendarConnectResponse,
    GoogleCalendarPushResponse,
    GoogleCalendarStatusResponse,
    GoogleCalendarSyncResponse,
)
from app.services import google_calendar

router = APIRouter(prefix="/api/google-calendar", tags=["google-calendar"])
logger = logging.getLogger("uvicorn.error")

# Distinct path from Outlook's own callback scheme (routers/outlook.py) so
# the frontend's appUrlOpen listener (lib/googleCalendarAuth.ts) can tell
# the two apart.
_APP_CALLBACK_SCHEME = "com.hooman.disciplined://google-calendar-callback"


@router.get("/connect", response_model=GoogleCalendarConnectResponse)
async def connect(user: User = Depends(get_current_user)):
    try:
        return GoogleCalendarConnectResponse(
            authorize_url=google_calendar.build_authorize_url(user.id)
        )
    except google_calendar.GoogleCalendarNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/callback", include_in_schema=False)
async def callback(code: str | None = None, state: str | None = None, db: AsyncSession = Depends(get_db)):
    """Hit by Google's redirect after login/consent — see
    routers/outlook.py::callback for the full rationale, identical here."""
    if not code or not state:
        return RedirectResponse(f"{_APP_CALLBACK_SCHEME}?status=error")
    try:
        user_id = google_calendar.verify_state_token(state)
    except jwt.InvalidTokenError:
        logger.warning("Google Calendar callback: invalid/expired state token")
        return RedirectResponse(f"{_APP_CALLBACK_SCHEME}?status=error")

    try:
        tokens = await google_calendar.exchange_code_for_tokens(code)
        await google_calendar.store_connection(db, user_id, tokens)
    except Exception:
        logger.exception("Google Calendar OAuth callback failed for user %s", user_id)
        return RedirectResponse(f"{_APP_CALLBACK_SCHEME}?status=error")

    return RedirectResponse(f"{_APP_CALLBACK_SCHEME}?status=success")


@router.get("/status", response_model=GoogleCalendarStatusResponse)
async def status(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    connected, email = await google_calendar.get_status(db, user.id)
    return GoogleCalendarStatusResponse(connected=connected, google_account_email=email)


@router.delete("/connection", status_code=204)
async def disconnect(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await google_calendar.disconnect(db, user.id)


@router.post("/sync", response_model=GoogleCalendarSyncResponse)
async def sync(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await google_calendar.sync_google_events(db, user.id)
    if result is None:
        raise HTTPException(status_code=400, detail="Google Calendar isn't connected")
    synced, pruned = result
    return GoogleCalendarSyncResponse(synced=synced, pruned=pruned)


@router.post("/push", response_model=GoogleCalendarPushResponse)
async def push(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await google_calendar.push_google_events(db, user.id)
    if result is None:
        raise HTTPException(status_code=400, detail="Google Calendar isn't connected")
    created, updated, unchanged, failed = result
    return GoogleCalendarPushResponse(created=created, updated=updated, unchanged=unchanged, failed=failed)
