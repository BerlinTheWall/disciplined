import logging

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import (
    OutlookConnectResponse,
    OutlookPushResponse,
    OutlookStatusResponse,
    OutlookSyncResponse,
)
from app.services import outlook_graph

router = APIRouter(prefix="/api/outlook", tags=["outlook"])
logger = logging.getLogger("uvicorn.error")

# Where routers/outlook.py's own /callback sends the in-app browser once the
# token exchange is done — the frontend's appUrlOpen listener
# (lib/outlookAuth.ts) picks this up and closes the browser. Must match the
# custom URL scheme registered in AndroidManifest.xml / iOS Info.plist.
_APP_CALLBACK_SCHEME = "com.hooman.disciplined://outlook-callback"


@router.get("/connect", response_model=OutlookConnectResponse)
async def connect(user: User = Depends(get_current_user)):
    try:
        return OutlookConnectResponse(authorize_url=outlook_graph.build_authorize_url(user.id))
    except outlook_graph.OutlookNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/callback", include_in_schema=False)
async def callback(code: str | None = None, state: str | None = None, db: AsyncSession = Depends(get_db)):
    """Hit by Microsoft's redirect after login/consent — a plain browser GET,
    not a disciplined-authenticated request. `state` (see
    outlook_graph.create_state_token) is how we recover which user started
    this. Always ends in a redirect to the app's custom scheme so the in-app
    browser closes and control returns to disciplined, success or failure."""
    if not code or not state:
        return RedirectResponse(f"{_APP_CALLBACK_SCHEME}?status=error")
    try:
        user_id = outlook_graph.verify_state_token(state)
    except jwt.InvalidTokenError:
        logger.warning("Outlook callback: invalid/expired state token")
        return RedirectResponse(f"{_APP_CALLBACK_SCHEME}?status=error")

    try:
        tokens = await outlook_graph.exchange_code_for_tokens(code)
        await outlook_graph.store_connection(db, user_id, tokens)
    except Exception:
        logger.exception("Outlook OAuth callback failed for user %s", user_id)
        return RedirectResponse(f"{_APP_CALLBACK_SCHEME}?status=error")

    return RedirectResponse(f"{_APP_CALLBACK_SCHEME}?status=success")


@router.get("/status", response_model=OutlookStatusResponse)
async def status(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    connected, email = await outlook_graph.get_status(db, user.id)
    return OutlookStatusResponse(connected=connected, ms_account_email=email)


@router.delete("/connection", status_code=204)
async def disconnect(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await outlook_graph.disconnect(db, user.id)


@router.post("/sync", response_model=OutlookSyncResponse)
async def sync(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await outlook_graph.sync_outlook_events(db, user.id)
    if result is None:
        raise HTTPException(status_code=400, detail="Outlook isn't connected")
    synced, pruned = result
    return OutlookSyncResponse(synced=synced, pruned=pruned)


@router.post("/push", response_model=OutlookPushResponse)
async def push(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await outlook_graph.push_outlook_events(db, user.id)
    if result is None:
        raise HTTPException(status_code=400, detail="Outlook isn't connected")
    created, updated, unchanged, failed = result
    return OutlookPushResponse(created=created, updated=updated, unchanged=unchanged, failed=failed)
