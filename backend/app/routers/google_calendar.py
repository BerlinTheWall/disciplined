import logging

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import (
    GoogleCalendarConnectResponse,
    GoogleCalendarReconcileResponse,
    GoogleCalendarStatusResponse,
)
from app.services import google_calendar, oauth_state
from app.tiers import require_tier

router = APIRouter(prefix="/api/google-calendar", tags=["google-calendar"])
logger = logging.getLogger("uvicorn.error")

# Distinct path from Outlook's own callback scheme (routers/outlook.py) so
# the frontend's appUrlOpen listener (lib/googleCalendarAuth.ts) can tell
# the two apart. Used for a native-app-initiated connect only — a
# web-initiated connect instead redirects to the return_to origin passed to
# /connect (see routers/outlook.py::_redirect_target for the full rationale).
_APP_CALLBACK_SCHEME = "com.hooman.disciplined://google-calendar-callback"


def _redirect_target(return_to: str | None, status: str, reason: str | None = None) -> str:
    suffix = f"&reason={reason}" if reason else ""
    if return_to:
        return f"{return_to}/?googleCalendarConnected={status}{suffix}"
    return f"{_APP_CALLBACK_SCHEME}?status={status}{suffix}"


def _error_reason(exc: Exception) -> str:
    """A short, non-sensitive code identifying what failed — surfaced in the
    error toast (see lib/googleCalendarAuth.ts) so a failure is diagnosable
    without needing server log access."""
    if isinstance(exc, httpx.HTTPStatusError):
        url = str(exc.request.url)
        endpoint = "token" if "/token" in url else "userinfo" if "userinfo" in url else "api"
        return f"{endpoint}_{exc.response.status_code}"
    return type(exc).__name__.lower()


@router.get("/connect", response_model=GoogleCalendarConnectResponse)
async def connect(return_to: str | None = None, user: User = Depends(require_tier("plus"))):
    try:
        authorize_url = google_calendar.build_authorize_url(
            user.id, return_to=oauth_state.sanitize_return_to(return_to)
        )
        return GoogleCalendarConnectResponse(authorize_url=authorize_url)
    except google_calendar.GoogleCalendarNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/callback", include_in_schema=False)
async def callback(code: str | None = None, state: str | None = None, db: AsyncSession = Depends(get_db)):
    """Hit by Google's redirect after login/consent — see
    routers/outlook.py::callback for the full rationale, identical here."""
    if not code or not state:
        return RedirectResponse(_redirect_target(None, "error"))
    try:
        user_id, return_to = google_calendar.verify_state_token(state)
    except jwt.InvalidTokenError:
        logger.warning("Google Calendar callback: invalid/expired state token")
        return RedirectResponse(_redirect_target(None, "error"))

    try:
        tokens = await google_calendar.exchange_code_for_tokens(code)
        await google_calendar.store_connection(db, user_id, tokens)
    except Exception as exc:
        logger.exception("Google Calendar OAuth callback failed for user %s", user_id)
        return RedirectResponse(_redirect_target(return_to, "error", reason=_error_reason(exc)))

    return RedirectResponse(_redirect_target(return_to, "success"))


@router.get("/status", response_model=GoogleCalendarStatusResponse)
async def status(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    connected, email = await google_calendar.get_status(db, user.id)
    return GoogleCalendarStatusResponse(connected=connected, google_account_email=email)


@router.delete("/connection", status_code=204)
async def disconnect(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await google_calendar.disconnect(db, user.id)


@router.post("/reconcile", response_model=GoogleCalendarReconcileResponse)
async def reconcile(
    is_write_target: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_tier("plus")),
):
    counts = await google_calendar.reconcile_google_calendar(db, user.id, is_write_target=is_write_target)
    if counts is None:
        raise HTTPException(status_code=400, detail="Google Calendar isn't connected")
    return GoogleCalendarReconcileResponse(**counts.__dict__)
