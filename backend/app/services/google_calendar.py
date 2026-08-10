"""Google Calendar OAuth + two-way calendar sync for the "Connect Google
Calendar" feature (Settings > Connected Calendars). Mirrors
app.services.outlook_graph file-for-file — see that module's docstring for
the shared reconciliation rationale (calendar_time.py has the comparison
logic both share). Kept as a separate, parallel implementation rather than a
shared "provider" abstraction — the two APIs' endpoints, response shapes,
and refresh-token semantics differ enough that isolating them keeps each
one's failure modes simple.

Deltas from Outlook worth knowing:
- Google only guarantees a refresh_token on the *first* consent unless
  prompt=consent forces re-consent every time (see build_authorize_url) —
  Microsoft has no equivalent gotcha.
- Google has a real revoke endpoint, used on disconnect (Microsoft doesn't).
- Deleted-elsewhere events come back as 410 Gone (Outlook: 404).
- Event fields: `summary`/`start.dateTime`/`end.dateTime`, a plain string
  `location` (Outlook: `subject`/nested `location.displayName`), and a
  real `updated` last-modified timestamp on every item.
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
from app.services import calendar_time, crypto, oauth_state
from app.services.tools import user_timezone

logger = logging.getLogger("uvicorn.error")

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"
# userinfo.email is required for _fetch_account_email's call to
# USERINFO_URL below — without it Google rejects that call with
# insufficient-scope, which previously failed the whole connect silently
# (the callback's except block caught it and redirected as if nothing
# happened, with no row ever written to google_calendar_connections).
SCOPE = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email"

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


def build_authorize_url(user_id: str, return_to: str | None = None) -> str:
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
        "state": oauth_state.create_state_token(_STATE_PURPOSE, user_id, return_to=return_to),
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def verify_state_token(token: str) -> tuple[str, str | None]:
    """Returns (user_id, return_to) — see outlook_graph.verify_state_token."""
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


def _parse_google_datetime(value: str) -> datetime:
    """A Google `dateTime` (already offset-aware, e.g.
    "2026-08-10T10:00:00-04:00") -> a UTC datetime."""
    return datetime.fromisoformat(value).astimezone(timezone.utc)


def _google_datetime_str(value: str) -> str:
    """Same parse as _parse_google_datetime, normalized to the Z-suffixed
    ISO string format used for signature/timestamp comparisons."""
    return _parse_google_datetime(value).isoformat().replace("+00:00", "Z")


def _parse_google_all_day(value: str) -> datetime:
    """An all-day event's `date` field ("2026-08-10", no time) — treated as
    midnight UTC."""
    return datetime.combine(date.fromisoformat(value), time.min, tzinfo=timezone.utc)


def _google_event_body(title: str, start_utc: datetime, end_utc: datetime) -> dict:
    return {
        "summary": title,
        "start": {"dateTime": start_utc.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "UTC"},
        "end": {"dateTime": end_utc.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "UTC"},
    }


def _local_fields_from_item(item: dict, tz) -> tuple[str, str, int, int]:
    """A Google event item -> (title, date, start_minutes, duration_minutes)."""
    start_field = item.get("start", {})
    end_field = item.get("end", {})
    all_day = "date" in start_field
    start_utc = (
        _parse_google_all_day(start_field["date"]) if all_day else _parse_google_datetime(start_field["dateTime"])
    )
    end_utc = (
        _parse_google_all_day(end_field["date"]) if all_day else _parse_google_datetime(end_field["dateTime"])
    )
    date_str, start_minutes, duration = calendar_time.utc_to_local_fields(
        start_utc, end_utc, tz, all_day=all_day
    )
    return item.get("summary") or "(no title)", date_str, start_minutes, duration


async def reconcile_google_calendar(
    db: AsyncSession, user_id: str, *, is_write_target: bool
) -> calendar_time.ReconcileCounts | None:
    """One two-way reconciliation pass — see reconcile_outlook_events for the
    full rationale, identical here. Returns None if Google Calendar isn't
    connected."""
    access_token = await get_valid_access_token(db, user_id)
    if access_token is None:
        return None
    conn = await db.scalar(
        select(GoogleCalendarConnection).where(GoogleCalendarConnection.user_id == user_id)
    )
    assert conn is not None

    tz = await user_timezone(db, user_id)
    start = datetime.now(timezone.utc) - timedelta(days=SYNC_WINDOW_PAST_DAYS)
    end = datetime.now(timezone.utc) + timedelta(days=SYNC_WINDOW_FUTURE_DAYS)
    window_start_date = start.astimezone(tz).date().isoformat()
    window_end_date = end.astimezone(tz).date().isoformat()

    counts = calendar_time.ReconcileCounts()
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{CALENDAR_BASE}/calendars/primary/events",
                headers=headers,
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
            remote_items = [i for i in resp.json().get("items", []) if i.get("status") != "cancelled"]
        except httpx.HTTPError as exc:
            logger.warning("Google Calendar reconcile fetch failed for user %s: %s", user_id, exc)
            return counts

        remote_by_id = {item["id"]: item for item in remote_items}
        linked = (
            await db.scalars(
                select(Event).where(Event.user_id == user_id, Event.google_event_id.is_not(None))
            )
        ).all()

        for task in linked:
            item = remote_by_id.get(task.google_event_id)
            if item is None:
                if not (window_start_date <= task.date <= window_end_date):
                    continue
                if calendar_time.most_recent_wins(task.updated_at, conn.last_synced_at):
                    start_utc, end_utc = calendar_time.local_to_utc(
                        task.date, task.start_minutes, task.duration_minutes, tz
                    )
                    try:
                        resp = await client.post(
                            f"{CALENDAR_BASE}/calendars/primary/events",
                            headers=headers,
                            json=_google_event_body(task.title, start_utc, end_utc),
                            timeout=10,
                        )
                        resp.raise_for_status()
                        task.google_event_id = resp.json()["id"]
                        task.google_sync_signature = calendar_time.event_signature(
                            task.title, task.date, task.start_minutes, task.duration_minutes
                        )
                        await db.commit()
                        counts.recreated_remote += 1
                    except httpx.HTTPError as exc:
                        logger.warning("Google Calendar recreate failed for task %s: %s", task.id, exc)
                        counts.failed += 1
                else:
                    await db.delete(task)
                    await db.commit()
                    counts.deleted_local += 1
                continue

            remote_title, remote_date, remote_start, remote_duration = _local_fields_from_item(item, tz)
            remote_modified = item.get("updated")
            remote_modified_norm = _google_datetime_str(remote_modified) if remote_modified else None
            local_sig = calendar_time.event_signature(
                task.title, task.date, task.start_minutes, task.duration_minutes
            )
            remote_sig = calendar_time.event_signature(
                remote_title, remote_date, remote_start, remote_duration
            )
            direction = calendar_time.resolve_direction(
                local_sig, remote_sig, task.google_sync_signature, task.updated_at, remote_modified_norm
            )
            if direction == "none":
                counts.unchanged += 1
                continue
            if direction == "push":
                start_utc, end_utc = calendar_time.local_to_utc(
                    task.date, task.start_minutes, task.duration_minutes, tz
                )
                try:
                    resp = await client.patch(
                        f"{CALENDAR_BASE}/calendars/primary/events/{task.google_event_id}",
                        headers=headers,
                        json=_google_event_body(task.title, start_utc, end_utc),
                        timeout=10,
                    )
                    resp.raise_for_status()
                    task.google_sync_signature = local_sig
                    await db.commit()
                    counts.updated_remote += 1
                except httpx.HTTPError as exc:
                    logger.warning("Google Calendar push failed for task %s: %s", task.id, exc)
                    counts.failed += 1
            else:  # pull
                task.title = remote_title
                task.date = remote_date
                task.start_minutes = remote_start
                task.duration_minutes = remote_duration
                task.updated_at = remote_modified_norm
                task.google_sync_signature = remote_sig
                await db.commit()
                counts.updated_local += 1

        linked_ids = {task.google_event_id for task in linked}
        for item in remote_items:
            if item["id"] in linked_ids:
                continue
            title, date_str, start_minutes, duration = _local_fields_from_item(item, tz)
            modified = item.get("updated")
            db.add(
                Event(
                    user_id=user_id,
                    title=title,
                    date=date_str,
                    start_minutes=start_minutes,
                    duration_minutes=duration,
                    google_event_id=item["id"],
                    google_sync_signature=calendar_time.event_signature(
                        title, date_str, start_minutes, duration
                    ),
                    updated_at=_google_datetime_str(modified) if modified else None,
                )
            )
            await db.commit()
            counts.created_local += 1

        if is_write_target:
            unlinked = (
                await db.scalars(
                    select(Event).where(
                        Event.user_id == user_id,
                        Event.google_event_id.is_(None),
                        Event.outlook_event_id.is_(None),
                        Event.apple_linked.isnot(True),
                    )
                )
            ).all()
            for task in unlinked:
                start_utc, end_utc = calendar_time.local_to_utc(
                    task.date, task.start_minutes, task.duration_minutes, tz
                )
                try:
                    resp = await client.post(
                        f"{CALENDAR_BASE}/calendars/primary/events",
                        headers=headers,
                        json=_google_event_body(task.title, start_utc, end_utc),
                        timeout=10,
                    )
                    resp.raise_for_status()
                    task.google_event_id = resp.json()["id"]
                    task.google_sync_signature = calendar_time.event_signature(
                        task.title, task.date, task.start_minutes, task.duration_minutes
                    )
                    await db.commit()
                    counts.created_remote += 1
                except httpx.HTTPError as exc:
                    logger.warning("Google Calendar push failed for task %s: %s", task.id, exc)
                    counts.failed += 1

    conn.last_synced_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    return counts


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
