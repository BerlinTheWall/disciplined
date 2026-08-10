"""Microsoft Graph OAuth + two-way calendar sync for the "Connect Outlook"
feature (Settings > Connected Calendars). Talks to Microsoft's servers
directly via a stored access/refresh token, regardless of whether the
account is synced into the phone's own calendar app.

reconcile_outlook_events() is a single two-way pass: every Outlook event in
the sync window becomes (or updates) a real, editable Event row, local edits
push back out, and whichever side changed more recently wins a genuine
conflict — see app.services.calendar_time for the shared comparison logic
also used by google_calendar.py.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Event, OutlookConnection
from app.services import calendar_time, crypto, oauth_state
from app.services.tools import user_timezone

logger = logging.getLogger("uvicorn.error")

AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"
SCOPES = "offline_access Calendars.ReadWrite User.Read"

# See app.services.oauth_state — each provider gets its own purpose (and
# therefore its own derived signing key), so a leaked Outlook state token
# can't be replayed against Google's callback or vice versa.
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


def build_authorize_url(user_id: str, return_to: str | None = None) -> str:
    _require_configured()
    params = {
        "client_id": settings.ms_graph_client_id,
        "response_type": "code",
        "redirect_uri": settings.ms_graph_redirect_uri,
        "response_mode": "query",
        "scope": SCOPES,
        "state": oauth_state.create_state_token(_STATE_PURPOSE, user_id, return_to=return_to),
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def verify_state_token(token: str) -> tuple[str, str | None]:
    """Thin wrapper so routers/outlook.py doesn't need to know the purpose
    string — raises jwt.InvalidTokenError/ExpiredSignatureError, same as
    oauth_state.verify_state_token. Returns (user_id, return_to)."""
    return oauth_state.verify_state_token(_STATE_PURPOSE, token)


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


def _parse_graph_datetime(value: str) -> datetime:
    """Graph's calendarView returns dateTime as a naive string ("...0000000")
    when queried with `Prefer: outlook.timezone="UTC"` — treat it as UTC.
    lastModifiedDateTime is a real DateTimeOffset (already UTC, possibly
    "Z"-suffixed) — dropping sub-second digits before parsing handles both
    shapes the same way, since we always attach UTC tzinfo ourselves."""
    naive = value.split(".")[0].rstrip("Z")
    return datetime.fromisoformat(naive).replace(tzinfo=timezone.utc)


def _graph_datetime_str(value: str) -> str:
    """Same parse as _parse_graph_datetime, normalized to the Z-suffixed ISO
    string format used for signature/timestamp comparisons."""
    return _parse_graph_datetime(value).isoformat().replace("+00:00", "Z")


def _graph_event_body(title: str, start_utc: datetime, end_utc: datetime) -> dict:
    return {
        "subject": title,
        "start": {"dateTime": start_utc.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "UTC"},
        "end": {"dateTime": end_utc.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "UTC"},
    }


def _local_fields_from_item(item: dict, tz) -> tuple[str, str, int, int]:
    """A Graph event item -> (title, date, start_minutes, duration_minutes)."""
    all_day = bool(item.get("isAllDay"))
    start_utc = _parse_graph_datetime(item["start"]["dateTime"])
    end_utc = _parse_graph_datetime(item["end"]["dateTime"])
    date_str, start_minutes, duration = calendar_time.utc_to_local_fields(
        start_utc, end_utc, tz, all_day=all_day
    )
    return item.get("subject") or "(no title)", date_str, start_minutes, duration


async def reconcile_outlook_events(
    db: AsyncSession, user_id: str, *, is_write_target: bool
) -> calendar_time.ReconcileCounts | None:
    """One two-way reconciliation pass: every Outlook event in the sync
    window becomes (or updates) a real, editable Event row; local changes
    push back out; whichever side changed more recently wins a genuine
    conflict (calendar_time.resolve_direction). Returns None if Outlook
    isn't connected."""
    access_token = await get_valid_access_token(db, user_id)
    if access_token is None:
        return None
    conn = await db.scalar(select(OutlookConnection).where(OutlookConnection.user_id == user_id))
    assert conn is not None  # get_valid_access_token returned non-None, so this exists

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
                f"{GRAPH_BASE}/me/calendarView",
                headers={**headers, "Prefer": 'outlook.timezone="UTC"'},
                params={
                    "startDateTime": start.isoformat(),
                    "endDateTime": end.isoformat(),
                    "$top": 250,
                    "$select": "id,subject,location,start,end,isAllDay,lastModifiedDateTime",
                },
                timeout=15,
            )
            resp.raise_for_status()
            remote_items = resp.json().get("value", [])
        except httpx.HTTPError as exc:
            logger.warning("Outlook reconcile fetch failed for user %s: %s", user_id, exc)
            return counts

        remote_by_id = {item["id"]: item for item in remote_items}
        linked = (
            await db.scalars(
                select(Event).where(Event.user_id == user_id, Event.outlook_event_id.is_not(None))
            )
        ).all()

        for task in linked:
            item = remote_by_id.get(task.outlook_event_id)
            if item is None:
                # Missing from this pass's fetch — only conclude "deleted" if
                # we'd actually expect to see it (its own date is inside the
                # window); otherwise it's simply outside this pass's reach,
                # not evidence of a remote deletion.
                if not (window_start_date <= task.date <= window_end_date):
                    continue
                if calendar_time.most_recent_wins(task.updated_at, conn.last_synced_at):
                    start_utc, end_utc = calendar_time.local_to_utc(
                        task.date, task.start_minutes, task.duration_minutes, tz
                    )
                    try:
                        resp = await client.post(
                            f"{GRAPH_BASE}/me/events",
                            headers=headers,
                            json=_graph_event_body(task.title, start_utc, end_utc),
                            timeout=10,
                        )
                        resp.raise_for_status()
                        task.outlook_event_id = resp.json()["id"]
                        task.outlook_sync_signature = calendar_time.event_signature(
                            task.title, task.date, task.start_minutes, task.duration_minutes
                        )
                        await db.commit()
                        counts.recreated_remote += 1
                    except httpx.HTTPError as exc:
                        logger.warning("Outlook recreate failed for task %s: %s", task.id, exc)
                        counts.failed += 1
                else:
                    await db.delete(task)
                    await db.commit()
                    counts.deleted_local += 1
                continue

            remote_title, remote_date, remote_start, remote_duration = _local_fields_from_item(item, tz)
            remote_modified = item.get("lastModifiedDateTime")
            remote_modified_norm = _graph_datetime_str(remote_modified) if remote_modified else None
            local_sig = calendar_time.event_signature(
                task.title, task.date, task.start_minutes, task.duration_minutes
            )
            remote_sig = calendar_time.event_signature(
                remote_title, remote_date, remote_start, remote_duration
            )
            direction = calendar_time.resolve_direction(
                local_sig, remote_sig, task.outlook_sync_signature, task.updated_at, remote_modified_norm
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
                        f"{GRAPH_BASE}/me/events/{task.outlook_event_id}",
                        headers=headers,
                        json=_graph_event_body(task.title, start_utc, end_utc),
                        timeout=10,
                    )
                    resp.raise_for_status()
                    task.outlook_sync_signature = local_sig
                    await db.commit()
                    counts.updated_remote += 1
                except httpx.HTTPError as exc:
                    logger.warning("Outlook push failed for task %s: %s", task.id, exc)
                    counts.failed += 1
            else:  # pull
                task.title = remote_title
                task.date = remote_date
                task.start_minutes = remote_start
                task.duration_minutes = remote_duration
                task.updated_at = remote_modified_norm
                task.outlook_sync_signature = remote_sig
                await db.commit()
                counts.updated_local += 1

        linked_ids = {task.outlook_event_id for task in linked}
        for item in remote_items:
            if item["id"] in linked_ids:
                continue
            title, date_str, start_minutes, duration = _local_fields_from_item(item, tz)
            modified = item.get("lastModifiedDateTime")
            db.add(
                Event(
                    user_id=user_id,
                    title=title,
                    date=date_str,
                    start_minutes=start_minutes,
                    duration_minutes=duration,
                    outlook_event_id=item["id"],
                    outlook_sync_signature=calendar_time.event_signature(
                        title, date_str, start_minutes, duration
                    ),
                    updated_at=_graph_datetime_str(modified) if modified else None,
                )
            )
            await db.commit()
            counts.created_local += 1

        if is_write_target:
            unlinked = (
                await db.scalars(
                    select(Event).where(
                        Event.user_id == user_id,
                        Event.outlook_event_id.is_(None),
                        Event.google_event_id.is_(None),
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
                        f"{GRAPH_BASE}/me/events",
                        headers=headers,
                        json=_graph_event_body(task.title, start_utc, end_utc),
                        timeout=10,
                    )
                    resp.raise_for_status()
                    task.outlook_event_id = resp.json()["id"]
                    task.outlook_sync_signature = calendar_time.event_signature(
                        task.title, task.date, task.start_minutes, task.duration_minutes
                    )
                    await db.commit()
                    counts.created_remote += 1
                except httpx.HTTPError as exc:
                    logger.warning("Outlook push failed for task %s: %s", task.id, exc)
                    counts.failed += 1

    conn.last_synced_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    return counts


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
