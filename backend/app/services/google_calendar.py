"""Google Calendar OAuth + read/write for the "Connect Google Calendar"
feature (Settings > Connected Calendars). Mirrors app.services.outlook_graph
file-for-file — see that module's docstring for the shared rationale (talks
to Google's servers directly via a stored token, regardless of whether the
account is synced into the phone's own calendar app; read side feeds the
same external_calendar_events table). Kept as a separate, parallel
implementation rather than a shared "provider" abstraction — the two APIs'
endpoints, response shapes, and refresh-token semantics differ enough that
isolating them keeps each one's failure modes simple.

Deltas from Outlook worth knowing:
- Google only guarantees a refresh_token on the *first* consent unless
  prompt=consent forces re-consent every time (see build_authorize_url) —
  Microsoft has no equivalent gotcha.
- Google has a real revoke endpoint, used on disconnect (Microsoft doesn't).
- Deleted-elsewhere events come back as 410 Gone (Outlook: 404).
- Event fields: `summary`/`start.dateTime`/`end.dateTime`, a plain string
  `location` (Outlook: `subject`/nested `location.displayName`).
"""

import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Event, GoogleCalendarConnection
from app.schemas import CalendarEventIn, CalendarSyncRequest
from app.services import crypto, oauth_state
from app.services.calendar_sync import sync_calendar_events
from app.services.tools import user_timezone

logger = logging.getLogger("uvicorn.error")

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"
SCOPE = "https://www.googleapis.com/auth/calendar"

_STATE_PURPOSE = "google_calendar_oauth_state"

SYNC_WINDOW_PAST_DAYS = 7
SYNC_WINDOW_FUTURE_DAYS = 60
_REFRESH_MARGIN = timedelta(minutes=2)


class GoogleCalendarNotConfigured(RuntimeError):
    pass


def _require_configured() -> None:
    if not (
        settings.google_calendar_client_id
        and settings.google_calendar_client_secret
        and settings.google_calendar_redirect_uri
    ):
        raise GoogleCalendarNotConfigured(
            "Google Calendar isn't configured on this server yet (GOOGLE_CALENDAR_* env vars) — "
            "see backend/.env.example"
        )


def build_authorize_url(user_id: str) -> str:
    _require_configured()
    params = {
        "client_id": settings.google_calendar_client_id,
        "response_type": "code",
        "redirect_uri": settings.google_calendar_redirect_uri,
        "scope": SCOPE,
        # offline -> Google returns a refresh_token; consent -> forces it on
        # *every* connect, not just the very first one ever for this user
        # (Google's default), so reconnecting after a lost/revoked token
        # reliably comes back with a usable refresh_token again.
        "access_type": "offline",
        "prompt": "consent",
        "state": oauth_state.create_state_token(_STATE_PURPOSE, user_id),
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def verify_state_token(token: str) -> str:
    return oauth_state.verify_state_token(_STATE_PURPOSE, token)


async def _fetch_account_email(access_token: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=10
        )
        resp.raise_for_status()
        return resp.json().get("email") or "unknown@google"


async def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    _require_configured()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.google_calendar_client_id,
                "client_secret": settings.google_calendar_client_secret,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.google_calendar_redirect_uri,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


async def store_connection(db: AsyncSession, user_id: str, tokens: dict[str, Any]) -> None:
    email = await _fetch_account_email(tokens["access_token"])
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
    now = datetime.now(timezone.utc).isoformat()

    existing = await db.scalar(
        select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user_id)
    )
    if existing is None:
        db.add(
            GoogleCalendarConnection(
                user_id=user_id,
                google_account_email=email,
                encrypted_access_token=crypto.encrypt(tokens["access_token"]),
                encrypted_refresh_token=crypto.encrypt(tokens["refresh_token"]),
                access_token_expires_at=expires_at.isoformat(),
                scope=tokens.get("scope", SCOPE),
                connected_at=now,
            )
        )
    else:
        existing.google_account_email = email
        existing.encrypted_access_token = crypto.encrypt(tokens["access_token"])
        existing.encrypted_refresh_token = crypto.encrypt(tokens["refresh_token"])
        existing.access_token_expires_at = expires_at.isoformat()
        existing.scope = tokens.get("scope", SCOPE)
    await db.commit()


async def _refresh(db: AsyncSession, conn: GoogleCalendarConnection) -> str | None:
    _require_configured()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.google_calendar_client_id,
                "client_secret": settings.google_calendar_client_secret,
                "grant_type": "refresh_token",
                "refresh_token": crypto.decrypt(conn.encrypted_refresh_token),
            },
            timeout=10,
        )
    if resp.status_code != 200:
        logger.warning("Google Calendar token refresh failed for user %s: %s", conn.user_id, resp.text)
        await db.delete(conn)
        await db.commit()
        return None
    tokens = resp.json()
    conn.encrypted_access_token = crypto.encrypt(tokens["access_token"])
    # Google generally doesn't rotate the refresh token on refresh; keep the
    # old one if this response doesn't include a new one.
    if tokens.get("refresh_token"):
        conn.encrypted_refresh_token = crypto.encrypt(tokens["refresh_token"])
    conn.access_token_expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
    ).isoformat()
    await db.commit()
    return tokens["access_token"]


async def get_valid_access_token(db: AsyncSession, user_id: str) -> str | None:
    conn = await db.scalar(
        select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user_id)
    )
    if conn is None:
        return None
    expires_at = datetime.fromisoformat(conn.access_token_expires_at)
    if datetime.now(timezone.utc) + _REFRESH_MARGIN < expires_at:
        return crypto.decrypt(conn.encrypted_access_token)
    return await _refresh(db, conn)


async def get_status(db: AsyncSession, user_id: str) -> tuple[bool, str | None]:
    conn = await db.scalar(
        select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user_id)
    )
    return (conn is not None, conn.google_account_email if conn else None)


async def disconnect(db: AsyncSession, user_id: str) -> None:
    conn = await db.scalar(
        select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user_id)
    )
    if conn is None:
        return
    try:
        async with httpx.AsyncClient() as client:
            # Revoking the refresh token invalidates the whole grant
            # (including any live access token) — best-effort, the local
            # row is removed either way.
            await client.post(
                REVOKE_URL,
                params={"token": crypto.decrypt(conn.encrypted_refresh_token)},
                timeout=10,
            )
    except httpx.HTTPError as exc:
        logger.warning("Google Calendar revoke failed for user %s: %s", user_id, exc)
    await db.delete(conn)
    await db.commit()


def _parse_google_datetime(value: str) -> str:
    """Normalizes a Google `dateTime` (already offset-aware, e.g.
    "2026-08-10T10:00:00-04:00") to the same Z-suffixed UTC ISO format the
    device-calendar path produces, so string comparisons in calendar_sync.py
    stay valid across every source."""
    return datetime.fromisoformat(value).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_google_all_day(value: str) -> str:
    """An all-day event's `date` field ("2026-08-10", no time) — treated as
    midnight UTC, same convention the device-calendar path uses for all-day
    events from EventKit/CalendarContract."""
    return datetime.combine(date.fromisoformat(value), time.min, tzinfo=timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )


async def sync_google_events(db: AsyncSession, user_id: str) -> tuple[int, int] | None:
    """Returns (synced, pruned), or None if Google Calendar isn't connected."""
    access_token = await get_valid_access_token(db, user_id)
    if access_token is None:
        return None

    conn = await db.scalar(
        select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user_id)
    )
    assert conn is not None

    start = datetime.now(timezone.utc) - timedelta(days=SYNC_WINDOW_PAST_DAYS)
    end = datetime.now(timezone.utc) + timedelta(days=SYNC_WINDOW_FUTURE_DAYS)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{CALENDAR_BASE}/calendars/primary/events",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "timeMin": start.isoformat(),
                "timeMax": end.isoformat(),
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 250,
            },
            timeout=15,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])

    events = []
    for item in items:
        if item.get("status") == "cancelled":
            continue
        start_field = item.get("start", {})
        end_field = item.get("end", {})
        all_day = "date" in start_field
        events.append(
            CalendarEventIn(
                external_event_id=item["id"],
                title=item.get("summary") or "(no title)",
                location=item.get("location") or None,
                start_at=(
                    _parse_google_all_day(start_field["date"])
                    if all_day
                    else _parse_google_datetime(start_field["dateTime"])
                ),
                end_at=(
                    _parse_google_all_day(end_field["date"])
                    if all_day
                    else _parse_google_datetime(end_field["dateTime"])
                ),
                all_day=all_day,
            )
        )

    req = CalendarSyncRequest(
        calendar_id="google:primary",
        calendar_name=f"{conn.google_account_email} (Google)",
        source_label="google",
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


def _google_event_body(title: str, start_utc: datetime, end_utc: datetime) -> dict:
    return {
        "summary": title,
        "start": {"dateTime": start_utc.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "UTC"},
        "end": {"dateTime": end_utc.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "UTC"},
    }


async def push_google_events(db: AsyncSession, user_id: str) -> tuple[int, int, int, int] | None:
    """Returns (created, updated, unchanged, failed), or None if Google
    Calendar isn't connected. Reads the user's own Event rows — no payload
    needed, the DB is already the source of truth."""
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
            if task.google_event_id and task.google_sync_signature == signature:
                unchanged += 1
                continue

            start_utc, end_utc = _event_times_utc(task, tz)
            body = _google_event_body(task.title, start_utc, end_utc)
            try:
                if task.google_event_id:
                    resp = await client.patch(
                        f"{CALENDAR_BASE}/calendars/primary/events/{task.google_event_id}",
                        headers=headers,
                        json=body,
                        timeout=10,
                    )
                    if resp.status_code in (404, 410):
                        # Deleted directly in Google Calendar since we last
                        # pushed (410 Gone is Google's flavor of this,
                        # unlike Graph's plain 404) — recreate.
                        task.google_event_id = None
                        resp = await client.post(
                            f"{CALENDAR_BASE}/calendars/primary/events",
                            headers=headers,
                            json=body,
                            timeout=10,
                        )
                    resp.raise_for_status()
                    if task.google_event_id is None:
                        task.google_event_id = resp.json()["id"]
                        created += 1
                    else:
                        updated += 1
                else:
                    resp = await client.post(
                        f"{CALENDAR_BASE}/calendars/primary/events", headers=headers, json=body, timeout=10
                    )
                    resp.raise_for_status()
                    task.google_event_id = resp.json()["id"]
                    created += 1
                task.google_sync_signature = signature
            except httpx.HTTPError as exc:
                logger.warning("Google Calendar push failed for task %s: %s", task.id, exc)
                failed += 1

    await db.commit()
    return created, updated, unchanged, failed


async def maybe_delete_google_event(db: AsyncSession, user_id: str, event: Event) -> None:
    """Best-effort cleanup, called wherever an Event with a google_event_id
    is deleted (routers/events.py, services/tools.py::_delete_event)."""
    if not event.google_event_id:
        return
    access_token = await get_valid_access_token(db, user_id)
    if access_token is None:
        return
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{CALENDAR_BASE}/calendars/primary/events/{event.google_event_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
            if resp.status_code not in (204, 404, 410):
                resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Google Calendar delete failed for event %s: %s", event.id, exc)
