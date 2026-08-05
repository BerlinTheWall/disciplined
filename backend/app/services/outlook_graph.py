"""Microsoft Graph OAuth + calendar read/write for the "Connect Outlook"
feature (Settings > Connected Calendars). Separate from the device-calendar
path (app.services.calendar_sync) — this talks to Microsoft's servers
directly via a stored access/refresh token, regardless of whether the
account is synced into the phone's own calendar app.

Read side feeds the SAME external_calendar_events table the device-calendar
sync uses (via sync_calendar_events), so the AI tools / timeline strip need
no changes to see Outlook events. Write side is new: Event rows get an
outlook_event_id once mirrored (see models.Event), diffed against a stored
signature so an unchanged Task doesn't cost a Graph call on every push.
"""

import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Event, OutlookConnection
from app.schemas import CalendarEventIn, CalendarSyncRequest
from app.services import crypto
from app.services.calendar_sync import sync_calendar_events
from app.services.tools import user_timezone

logger = logging.getLogger("uvicorn.error")

AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"
SCOPES = "offline_access Calendars.ReadWrite User.Read"

STATE_TOKEN_ALGORITHM = "HS256"
STATE_TOKEN_TTL_MINUTES = 10
# Signed with a key *derived from* (not equal to) the session JWT secret —
# deliberately not the same key auth.get_current_user verifies against. The
# state param round-trips through a URL to Microsoft's login page (browser
# history, referrers, server logs on their end) — if it were valid as a
# session token too, a leaked state value would let someone impersonate the
# user, not just replay a stale OAuth attempt.
_STATE_SIGNING_KEY = f"{settings.jwt_secret}|outlook-oauth-state"
_STATE_PURPOSE = "outlook_oauth_state"

# Read-sync window — matches the device-calendar path's PULL_WINDOW_*
# constants (frontend/src/lib/deviceCalendarSync.ts) for consistent behavior
# between the two calendar sources.
SYNC_WINDOW_PAST_DAYS = 7
SYNC_WINDOW_FUTURE_DAYS = 60

# Refresh the access token once it's this close to expiring, not only after
# it's already dead — avoids a request failing mid-flight over a few seconds.
_REFRESH_MARGIN = timedelta(minutes=2)


class OutlookNotConfigured(RuntimeError):
    pass


def _require_configured() -> None:
    if not (settings.ms_graph_client_id and settings.ms_graph_client_secret and settings.ms_graph_redirect_uri):
        raise OutlookNotConfigured(
            "Outlook isn't configured on this server yet (MS_GRAPH_* env vars) — see backend/.env.example"
        )


def create_state_token(user_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=STATE_TOKEN_TTL_MINUTES)
    return jwt.encode(
        {"sub": user_id, "purpose": _STATE_PURPOSE, "exp": expires},
        _STATE_SIGNING_KEY,
        algorithm=STATE_TOKEN_ALGORITHM,
    )


def verify_state_token(token: str) -> str:
    """Returns the disciplined user_id that started this OAuth attempt, or
    raises jwt.InvalidTokenError/ExpiredSignatureError."""
    payload = jwt.decode(token, _STATE_SIGNING_KEY, algorithms=[STATE_TOKEN_ALGORITHM])
    if payload.get("purpose") != _STATE_PURPOSE:
        raise jwt.InvalidTokenError("wrong token purpose")
    return payload["sub"]


def build_authorize_url(user_id: str) -> str:
    _require_configured()
    params = {
        "client_id": settings.ms_graph_client_id,
        "response_type": "code",
        "redirect_uri": settings.ms_graph_redirect_uri,
        "response_mode": "query",
        "scope": SCOPES,
        "state": create_state_token(user_id),
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def _fetch_account_email(access_token: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GRAPH_BASE}/me", headers={"Authorization": f"Bearer {access_token}"}, timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("mail") or data.get("userPrincipalName") or "unknown@outlook"


async def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    """Called with the code from Microsoft's redirect, after routers/outlook.py
    has already verified `state` and recovered the disciplined user_id."""
    _require_configured()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.ms_graph_client_id,
                "client_secret": settings.ms_graph_client_secret,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.ms_graph_redirect_uri,
                "scope": SCOPES,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


async def store_connection(db: AsyncSession, user_id: str, tokens: dict[str, Any]) -> None:
    email = await _fetch_account_email(tokens["access_token"])
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
    now = datetime.now(timezone.utc).isoformat()

    existing = await db.scalar(select(OutlookConnection).where(OutlookConnection.user_id == user_id))
    if existing is None:
        db.add(
            OutlookConnection(
                user_id=user_id,
                ms_account_email=email,
                encrypted_access_token=crypto.encrypt(tokens["access_token"]),
                encrypted_refresh_token=crypto.encrypt(tokens["refresh_token"]),
                access_token_expires_at=expires_at.isoformat(),
                scope=tokens.get("scope", SCOPES),
                connected_at=now,
            )
        )
    else:
        existing.ms_account_email = email
        existing.encrypted_access_token = crypto.encrypt(tokens["access_token"])
        existing.encrypted_refresh_token = crypto.encrypt(tokens["refresh_token"])
        existing.access_token_expires_at = expires_at.isoformat()
        existing.scope = tokens.get("scope", SCOPES)
    await db.commit()


async def _refresh(db: AsyncSession, conn: OutlookConnection) -> str | None:
    _require_configured()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.ms_graph_client_id,
                "client_secret": settings.ms_graph_client_secret,
                "grant_type": "refresh_token",
                "refresh_token": crypto.decrypt(conn.encrypted_refresh_token),
                "scope": SCOPES,
            },
            timeout=10,
        )
    if resp.status_code != 200:
        # Refresh token revoked/expired (e.g. the user removed disciplined's
        # access in their Microsoft account) — the connection is dead either
        # way, so drop it rather than retrying forever with a bad token.
        logger.warning("Outlook token refresh failed for user %s: %s", conn.user_id, resp.text)
        await db.delete(conn)
        await db.commit()
        return None
    tokens = resp.json()
    conn.encrypted_access_token = crypto.encrypt(tokens["access_token"])
    # Microsoft may or may not rotate the refresh token; keep the old one if absent.
    if tokens.get("refresh_token"):
        conn.encrypted_refresh_token = crypto.encrypt(tokens["refresh_token"])
    conn.access_token_expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
    ).isoformat()
    await db.commit()
    return tokens["access_token"]


async def get_valid_access_token(db: AsyncSession, user_id: str) -> str | None:
    """None means "not connected" (or the connection just died on refresh) —
    every caller in this module treats that as a no-op, not an error."""
    conn = await db.scalar(select(OutlookConnection).where(OutlookConnection.user_id == user_id))
    if conn is None:
        return None
    expires_at = datetime.fromisoformat(conn.access_token_expires_at)
    if datetime.now(timezone.utc) + _REFRESH_MARGIN < expires_at:
        return crypto.decrypt(conn.encrypted_access_token)
    return await _refresh(db, conn)


async def get_status(db: AsyncSession, user_id: str) -> tuple[bool, str | None]:
    conn = await db.scalar(select(OutlookConnection).where(OutlookConnection.user_id == user_id))
    return (conn is not None, conn.ms_account_email if conn else None)


async def disconnect(db: AsyncSession, user_id: str) -> None:
    conn = await db.scalar(select(OutlookConnection).where(OutlookConnection.user_id == user_id))
    if conn is not None:
        await db.delete(conn)
        await db.commit()


def _parse_graph_datetime(value: str) -> str:
    """Graph's calendarView returns dateTime as a naive string ("...0000000")
    when queried with `Prefer: outlook.timezone="UTC"` (see sync_outlook_events)
    — treat it as UTC and normalize to the same Z-suffixed ISO format the
    device-calendar path already produces, so string comparisons in
    calendar_sync.py stay valid across both sources."""
    naive = value.split(".")[0]  # drop sub-second digits Python's fromisoformat can't take
    return datetime.fromisoformat(naive).replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


async def sync_outlook_events(db: AsyncSession, user_id: str) -> tuple[int, int] | None:
    """Returns (synced, pruned), or None if Outlook isn't connected."""
    access_token = await get_valid_access_token(db, user_id)
    if access_token is None:
        return None

    conn = await db.scalar(select(OutlookConnection).where(OutlookConnection.user_id == user_id))
    assert conn is not None  # get_valid_access_token returned non-None, so this exists

    start = datetime.now(timezone.utc) - timedelta(days=SYNC_WINDOW_PAST_DAYS)
    end = datetime.now(timezone.utc) + timedelta(days=SYNC_WINDOW_FUTURE_DAYS)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GRAPH_BASE}/me/calendarView",
            headers={
                "Authorization": f"Bearer {access_token}",
                'Prefer': 'outlook.timezone="UTC"',
            },
            params={
                "startDateTime": start.isoformat(),
                "endDateTime": end.isoformat(),
                "$top": 250,
                "$select": "id,subject,location,start,end,isAllDay",
            },
            timeout=15,
        )
        resp.raise_for_status()
        items = resp.json().get("value", [])

    events = [
        CalendarEventIn(
            external_event_id=item["id"],
            title=item.get("subject") or "(no title)",
            location=(item.get("location") or {}).get("displayName") or None,
            start_at=_parse_graph_datetime(item["start"]["dateTime"]),
            end_at=_parse_graph_datetime(item["end"]["dateTime"]),
            all_day=bool(item.get("isAllDay")),
        )
        for item in items
    ]

    req = CalendarSyncRequest(
        calendar_id="outlook:primary",
        calendar_name=f"{conn.ms_account_email} (Outlook)",
        source_label="outlook",
        range_start=start.isoformat().replace("+00:00", "Z"),
        range_end=end.isoformat().replace("+00:00", "Z"),
        events=events,
    )
    return await sync_calendar_events(db, user_id, req)


def _event_signature(e: Event) -> str:
    return f"{e.title}|{e.date}|{e.start_minutes}|{e.duration_minutes}"


def _event_times_utc(e: Event, tz) -> tuple[datetime, datetime]:
    local_start = datetime.combine(date.fromisoformat(e.date), time.min, tzinfo=tz) + timedelta(
        minutes=e.start_minutes
    )
    local_end = local_start + timedelta(minutes=e.duration_minutes)
    return local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


def _graph_event_body(title: str, start_utc: datetime, end_utc: datetime) -> dict:
    return {
        "subject": title,
        "start": {"dateTime": start_utc.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "UTC"},
        "end": {"dateTime": end_utc.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "UTC"},
    }


async def push_outlook_events(db: AsyncSession, user_id: str) -> tuple[int, int, int, int] | None:
    """Returns (created, updated, unchanged, failed), or None if Outlook
    isn't connected. Reads the user's own Event rows — no payload needed,
    the DB is already the source of truth."""
    access_token = await get_valid_access_token(db, user_id)
    if access_token is None:
        return None

    tz = await user_timezone(db, user_id)
    tasks = (await db.scalars(select(Event).where(Event.user_id == user_id))).all()

    created = updated = unchanged = failed = 0
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {access_token}"}
        for task in tasks:
            signature = _event_signature(task)
            if task.outlook_event_id and task.outlook_sync_signature == signature:
                unchanged += 1
                continue

            start_utc, end_utc = _event_times_utc(task, tz)
            body = _graph_event_body(task.title, start_utc, end_utc)
            try:
                if task.outlook_event_id:
                    resp = await client.patch(
                        f"{GRAPH_BASE}/me/events/{task.outlook_event_id}",
                        headers=headers,
                        json=body,
                        timeout=10,
                    )
                    if resp.status_code == 404:
                        # Deleted directly in Outlook since we last pushed — recreate.
                        task.outlook_event_id = None
                        resp = await client.post(
                            f"{GRAPH_BASE}/me/events", headers=headers, json=body, timeout=10
                        )
                    resp.raise_for_status()
                    if task.outlook_event_id is None:
                        task.outlook_event_id = resp.json()["id"]
                        created += 1
                    else:
                        updated += 1
                else:
                    resp = await client.post(
                        f"{GRAPH_BASE}/me/events", headers=headers, json=body, timeout=10
                    )
                    resp.raise_for_status()
                    task.outlook_event_id = resp.json()["id"]
                    created += 1
                task.outlook_sync_signature = signature
            except httpx.HTTPError as exc:
                logger.warning("Outlook push failed for task %s: %s", task.id, exc)
                failed += 1

    await db.commit()
    return created, updated, unchanged, failed


async def maybe_delete_outlook_event(db: AsyncSession, user_id: str, event: Event) -> None:
    """Best-effort cleanup, called wherever an Event with an outlook_event_id
    is deleted (routers/events.py, services/tools.py::_delete_event) — so a
    removed Task doesn't linger on the real Outlook calendar until the next
    push notices it's gone (which it never would: the Event row, and its
    outlook_event_id, are gone at that point)."""
    if not event.outlook_event_id:
        return
    access_token = await get_valid_access_token(db, user_id)
    if access_token is None:
        return
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{GRAPH_BASE}/me/events/{event.outlook_event_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
            if resp.status_code not in (204, 404):
                resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Outlook delete failed for event %s: %s", event.id, exc)
