from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.services.calendar_time import (
    event_signature,
    most_recent_wins,
    resolve_direction,
    utc_to_local_fields,
)

NY = ZoneInfo("America/New_York")


def test_utc_to_local_fields_same_day_event():
    # 14:00-15:00 UTC = 10:00-11:00 America/New_York (UTC-4 in August).
    start = datetime(2026, 8, 10, 14, 0, tzinfo=timezone.utc)
    end = datetime(2026, 8, 10, 15, 0, tzinfo=timezone.utc)
    date_str, start_minutes, duration = utc_to_local_fields(start, end, NY)
    assert date_str == "2026-08-10"
    assert start_minutes == 10 * 60
    assert duration == 60


def test_utc_to_local_fields_clamps_overflow_past_midnight():
    # 23:50 local for 30 minutes would run to 00:20 the next day — must clamp
    # to end-of-day rather than spill into a duration Event can't represent.
    start = datetime(2026, 8, 11, 3, 50, tzinfo=timezone.utc)  # 23:50 EDT (UTC-4)
    end = datetime(2026, 8, 11, 4, 20, tzinfo=timezone.utc)  # 00:20 EDT next day
    date_str, start_minutes, duration = utc_to_local_fields(start, end, NY)
    assert date_str == "2026-08-10"
    assert start_minutes == 23 * 60 + 50
    assert duration == 24 * 60 - start_minutes  # clamped, not 30


def test_utc_to_local_fields_crosses_midnight_in_local_tz():
    # 02:00 UTC is 22:00 the *previous* local day in a US timezone — the
    # local date must follow the timezone conversion, not the UTC date.
    start = datetime(2026, 8, 11, 2, 0, tzinfo=timezone.utc)
    end = datetime(2026, 8, 11, 3, 0, tzinfo=timezone.utc)
    date_str, start_minutes, duration = utc_to_local_fields(start, end, NY)
    assert date_str == "2026-08-10"
    assert start_minutes == 22 * 60
    assert duration == 60


def test_utc_to_local_fields_all_day_event():
    start = datetime(2026, 8, 10, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc)
    date_str, start_minutes, duration = utc_to_local_fields(start, end, NY, all_day=True)
    assert date_str == "2026-08-10"
    assert start_minutes == 0
    assert duration == 24 * 60


def test_most_recent_wins_both_present():
    assert most_recent_wins("2026-08-10T12:00:00Z", "2026-08-10T11:00:00Z") is True
    assert most_recent_wins("2026-08-10T11:00:00Z", "2026-08-10T12:00:00Z") is False


def test_most_recent_wins_missing_side_always_loses_or_wins():
    assert most_recent_wins(None, "2026-08-10T12:00:00Z") is False
    assert most_recent_wins("2026-08-10T12:00:00Z", None) is True
    assert most_recent_wins(None, None) is False


def test_resolve_direction_unchanged():
    sig = event_signature("Gym", "2026-08-10", 600, 60)
    assert resolve_direction(sig, sig, sig, "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z") == "none"


def test_resolve_direction_only_local_changed():
    mirrored = event_signature("Gym", "2026-08-10", 600, 60)
    local = event_signature("Gym (renamed)", "2026-08-10", 600, 60)
    assert resolve_direction(local, mirrored, mirrored, "2026-08-05T00:00:00Z", None) == "push"


def test_resolve_direction_only_remote_changed():
    mirrored = event_signature("Gym", "2026-08-10", 600, 60)
    remote = event_signature("Gym (renamed remotely)", "2026-08-10", 600, 60)
    assert resolve_direction(mirrored, remote, mirrored, None, "2026-08-05T00:00:00Z") == "pull"


def test_resolve_direction_conflict_uses_timestamp():
    mirrored = event_signature("Gym", "2026-08-10", 600, 60)
    local = event_signature("Gym (local edit)", "2026-08-10", 600, 60)
    remote = event_signature("Gym (remote edit)", "2026-08-10", 600, 60)
    # Local edited more recently -> push wins.
    assert (
        resolve_direction(local, remote, mirrored, "2026-08-10T00:00:00Z", "2026-08-05T00:00:00Z")
        == "push"
    )
    # Remote edited more recently -> pull wins.
    assert (
        resolve_direction(local, remote, mirrored, "2026-08-05T00:00:00Z", "2026-08-10T00:00:00Z")
        == "pull"
    )


def test_resolve_direction_completed_toggle_is_not_a_false_conflict():
    # Toggling `completed` stamps updated_at without changing title/date/
    # time — the signature-gate must treat this as "unchanged" content-wise,
    # not let a stale local updated_at beat a genuine remote edit.
    mirrored = event_signature("Gym", "2026-08-10", 600, 60)
    remote = event_signature("Gym (renamed remotely)", "2026-08-10", 600, 60)
    # local_signature still matches mirrored (only `completed` changed, which
    # isn't part of the signature) but local_updated_at is very recent.
    assert (
        resolve_direction(mirrored, remote, mirrored, "2026-08-10T23:59:59Z", "2026-08-05T00:00:00Z")
        == "pull"
    )
