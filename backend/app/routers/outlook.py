import logging

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import OutlookConnectResponse, OutlookReconcileResponse, OutlookStatusResponse
from app.services import oauth_state, outlook_graph

router = APIRouter(prefix="/api/outlook", tags=["outlook"])
logger = logging.getLogger("uvicorn.error")

# Where routers/outlook.py's own /callback sends the in-app browser once the
# token exchange is done, for a native-app-initiated connect — the
# frontend's appUrlOpen listener (lib/outlookAuth.ts) picks this up and
# closes the browser. Must match the custom URL scheme registered in
# AndroidManifest.xml / iOS Info.plist. A web-initiated connect instead
# redirects to the return_to origin passed to /connect (see below).
_APP_CALLBACK_SCHEME = "com.hooman.disciplined://outlook-callback"


def _redirect_target(return_to: str | None, status: str, reason: str | None = None) -> str:
    suffix = f"&reason={reason}" if reason else ""
    if return_to:
        return f"{return_to}/?outlookConnected={status}{suffix}"
    return f"{_APP_CALLBACK_SCHEME}?status={status}{suffix}"


def _error_reason(exc: Exception) -> str:
    """See routers/google_calendar.py::_error_reason — identical rationale."""
    if isinstance(exc, httpx.HTTPStatusError):
        url = str(exc.request.url)
        endpoint = "token" if "/token" in url else "userinfo" if "/me" in url else "api"
        return f"{endpoint}_{exc.response.status_code}"
    return type(exc).__name__.lower()


@router.get("/connect", response_model=OutlookConnectResponse)
async def connect(return_to: str | None = None, user: User = Depends(get_current_user)):
    try:
        authorize_url = outlook_graph.build_authorize_url(
            user.id, return_to=oauth_state.sanitize_return_to(return_to)
        )
        return OutlookConnectResponse(authorize_url=authorize_url)
    except outlook_graph.OutlookNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/callback", include_in_schema=False)
async def callback(code: str | None = None, state: str | None = None, db: AsyncSession = Depends(get_db)):
    """Hit by Microsoft's redirect after login/consent — a plain browser GET,
    not a disciplined-authenticated request. `state` (see
    outlook_graph.create_state_token) is how we recover which user started
    this, and whether to return to a web origin or the native app."""
    if not code or not state:
        return RedirectResponse(_redirect_target(None, "error"))
    try:
        user_id, return_to = outlook_graph.verify_state_token(state)
    except jwt.InvalidTokenError:
        logger.warning("Outlook callback: invalid/expired state token")
        return RedirectResponse(_redirect_target(None, "error"))

    try:
        tokens = await outlook_graph.exchange_code_for_tokens(code)
        await outlook_graph.store_connection(db, user_id, tokens)
    except Exception as exc:
        logger.exception("Outlook OAuth callback failed for user %s", user_id)
        return RedirectResponse(_redirect_target(return_to, "error", reason=_error_reason(exc)))

    return RedirectResponse(_redirect_target(return_to, "success"))


@router.get("/status", response_model=OutlookStatusResponse)
async def status(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    connected, email = await outlook_graph.get_status(db, user.id)
    return OutlookStatusResponse(connected=connected, ms_account_email=email)


@router.delete("/connection", status_code=204)
async def disconnect(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await outlook_graph.disconnect(db, user.id)


@router.post("/reconcile", response_model=OutlookReconcileResponse)
async def reconcile(
    is_write_target: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    counts = await outlook_graph.reconcile_outlook_events(db, user.id, is_write_target=is_write_target)
    if counts is None:
        raise HTTPException(status_code=400, detail="Outlook isn't connected")
    return OutlookReconcileResponse(**counts.__dict__)
