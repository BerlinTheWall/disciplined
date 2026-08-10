"""Shared local(date/start_minutes/duration_minutes) <-> UTC datetime
conversions, content-signature, and most-recent-wins comparison, used
identically by outlook_graph.py and google_calendar.py's reconcile_* — kept
here once instead of duplicated per provider (as _event_signature/
_event_times_utc used to be).
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo


@dataclass
class ReconcileCounts:
    """Shared return shape for reconcile_outlook_events/reconcile_google_calendar
    — field names match OutlookReconcileResponse/GoogleCalendarReconcileResponse
    in schemas.py (CamelModel aliases them to camelCase for the client)."""

    created_local: int = 0
    created_remote: int = 0
    updated_local: int = 0
    updated_remote: int = 0
    deleted_local: int = 0
    recreated_remote: int = 0
    unchanged: int = 0
    failed: int = 0


def event_signature(title: str, date_str: str, start_minutes: int, duration_minutes: int) -> str:
    return f"{title}|{date_str}|{start_minutes}|{duration_minutes}"


def local_to_utc(
    date_str: str, start_minutes: int, duration_minutes: int, tz: ZoneInfo
) -> tuple[datetime, datetime]:
    """A Task's local date+start_minutes+duration_minutes -> UTC start/end —
    the direction disciplined's own tasks already push out to a provider."""
    local_start = datetime.combine(date.fromisoformat(date_str), time.min, tzinfo=tz) + timedelta(
        minutes=start_minutes
    )
    local_end = local_start + timedelta(minutes=duration_minutes)
    return local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


def utc_to_local_fields(
    start_utc: datetime, end_utc: datetime, tz: ZoneInfo, *, all_day: bool = False
) -> tuple[str, int, int]:
    """The reverse of local_to_utc — a provider's UTC start/end -> the
    (date, start_minutes, duration_minutes) shape Event stores. All-day
    events skip the generic math entirely (there's no meaningful "local
    clock time" to convert) and just span the full day.

    A genuinely multi-day event gets truncated to its first calendar day —
    Event has no multi-day representation, so `duration_minutes` is clamped
    to never spill past midnight. This is a real, lossy simplification for
    multi-day remote events, not a bug to fix here."""
    if all_day:
        # An all-day event's date is a calendar date, not a specific instant
        # — callers already normalize it to UTC midnight of that date (see
        # _parse_google_all_day/similar), so read the date straight off
        # start_utc rather than converting through the local timezone, which
        # would shift it a day backward for any timezone behind UTC.
        return start_utc.date().isoformat(), 0, 24 * 60

    start_local = start_utc.astimezone(tz)
    end_local = end_utc.astimezone(tz)
    start_minutes = start_local.hour * 60 + start_local.minute
    duration_minutes = max(1, round((end_local - start_local).total_seconds() / 60))
    duration_minutes = min(duration_minutes, 24 * 60 - start_minutes)
    return start_local.date().isoformat(), start_minutes, duration_minutes


def most_recent_wins(a: str | None, b: str | None) -> bool:
    """True if ISO-UTC timestamp `a` is more recent than `b` (or `b` is
    missing). `None` is always "infinitely old". Plain lexicographic string
    comparison — safe because every caller already normalizes timestamps to
    the same fixed-width, Z-suffixed format before calling this."""
    if a is None:
        return False
    if b is None:
        return True
    return a > b


ReconcileDirection = Literal["none", "push", "pull", "conflict"]


def resolve_direction(
    local_signature: str,
    remote_signature: str,
    mirrored_signature: str | None,
    local_updated_at: str | None,
    remote_updated_at: str | None,
) -> ReconcileDirection:
    """Which side (if any) should overwrite the other, for one already-linked
    event pair. Gates on whether either side's actual schedule-relevant
    content drifted from what was last mirrored *before* ever comparing
    timestamps — comparing raw timestamps alone would treat e.g. toggling a
    task's `completed` flag (which stamps `updated_at` without changing
    anything a provider stores) as "newer" than a genuine concurrent remote
    edit, silently discarding it. Timestamps only decide the winner when both
    sides genuinely changed since the last mirror (a real conflict)."""
    local_changed = local_signature != mirrored_signature
    remote_changed = remote_signature != mirrored_signature
    if not local_changed and not remote_changed:
        return "none"
    if local_changed and not remote_changed:
        return "push"
    if remote_changed and not local_changed:
        return "pull"
    return "push" if most_recent_wins(local_updated_at, remote_updated_at) else "pull"
