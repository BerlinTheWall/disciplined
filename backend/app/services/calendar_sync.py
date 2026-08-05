"""Device calendar sync: one-way ingestion of Apple/Google/Outlook events read
by the frontend via the native EventKit/CalendarContract plugin (see
frontend/src/lib/deviceCalendarSync.ts). Purely for AI/timeline awareness —
nothing here is ever written back to the device; that direction is entirely
client-side and never touches this table.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExternalCalendarEvent
from app.schemas import CalendarSyncRequest


async def sync_calendar_events(
    db: AsyncSession, user_id: str, body: CalendarSyncRequest
) -> tuple[int, int]:
    """Upserts every event in the payload, then prunes any previously-stored
    row for this calendar whose start_at falls inside [range_start, range_end]
    but wasn't included this time — the plugin has no separate deletion feed,
    so "still exists" is simply "present in this sync's window"."""
    now = datetime.now(timezone.utc).isoformat()
    seen_ids: set[str] = set()

    for item in body.events:
        seen_ids.add(item.external_event_id)
        existing = (
            await db.scalars(
                select(ExternalCalendarEvent).where(
                    ExternalCalendarEvent.user_id == user_id,
                    ExternalCalendarEvent.external_event_id == item.external_event_id,
                )
            )
        ).first()
        if existing is None:
            db.add(
                ExternalCalendarEvent(
                    user_id=user_id,
                    device_calendar_id=body.calendar_id,
                    device_calendar_name=body.calendar_name,
                    source_label=body.source_label,
                    external_event_id=item.external_event_id,
                    title=item.title,
                    location=item.location,
                    start_at=item.start_at,
                    end_at=item.end_at,
                    all_day=item.all_day,
                    last_synced_at=now,
                )
            )
        else:
            existing.device_calendar_id = body.calendar_id
            existing.device_calendar_name = body.calendar_name
            existing.source_label = body.source_label
            existing.title = item.title
            existing.location = item.location
            existing.start_at = item.start_at
            existing.end_at = item.end_at
            existing.all_day = item.all_day
            existing.last_synced_at = now

    stale = (
        await db.scalars(
            select(ExternalCalendarEvent).where(
                ExternalCalendarEvent.user_id == user_id,
                ExternalCalendarEvent.device_calendar_id == body.calendar_id,
                ExternalCalendarEvent.start_at >= body.range_start,
                ExternalCalendarEvent.start_at <= body.range_end,
            )
        )
    ).all()
    pruned = 0
    for row in stale:
        if row.external_event_id not in seen_ids:
            await db.delete(row)
            pruned += 1

    await db.commit()
    return len(body.events), pruned


async def list_calendar_events(
    db: AsyncSession, user_id: str, start_at: str, end_at: str
) -> list[ExternalCalendarEvent]:
    """Events overlapping [start_at, end_at) — both ISO UTC datetimes,
    comparable lexicographically since the frontend always sends
    `Date.toISOString()` output (fixed-width, always "Z"-suffixed)."""
    return (
        await db.scalars(
            select(ExternalCalendarEvent)
            .where(
                ExternalCalendarEvent.user_id == user_id,
                ExternalCalendarEvent.start_at < end_at,
                ExternalCalendarEvent.end_at > start_at,
            )
            .order_by(ExternalCalendarEvent.start_at)
        )
    ).all()
