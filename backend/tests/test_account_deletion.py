"""Permanent account deletion.

An irreversible operation that the App Store and Play Store both require, so
these tests care about two things equally: that it removes everything, and
that it cannot be triggered by accident or by the wrong person.
"""

from sqlalchemy import func, select

from app.auth import create_access_token
from app.database import Base
from app.models import ChatUsage, OutlookConnection, TtsUsage, User
from app.services.account_deletion import user_owned_tables

PASSWORD = "correct-horse-battery"


async def _populate(client, db, user, headers):
    """Give the account a row in as many tables as possible."""
    await client.post(
        "/api/events",
        json={"title": "Dentist", "date": "2026-08-10", "startMinutes": 600, "durationMinutes": 60},
        headers=headers,
    )
    db.add_all(
        [
            OutlookConnection(
                user_id=user.id,
                ms_account_email="test@outlook.com",
                encrypted_access_token="enc-access",
                encrypted_refresh_token="enc-refresh",
                access_token_expires_at="2026-09-01T00:00:00+00:00",
                scope="Calendars.ReadWrite",
                connected_at="2026-08-01T00:00:00+00:00",
            ),
            TtsUsage(user_id=user.id, year_month="2026-09", chars_used=1234),
            ChatUsage(user_id=user.id, date="2026-09-03", count=7),
        ]
    )
    await db.commit()


async def _rows_for(db, user_id: str) -> int:
    total = 0
    for table in user_owned_tables():
        total += await db.scalar(
            select(func.count()).select_from(table).where(table.c.user_id == user_id)
        )
    return total


async def test_deletes_the_account_and_all_of_its_rows(client, db, user, auth_headers):
    await _populate(client, db, user, auth_headers)
    assert await _rows_for(db, user.id) > 0

    res = await client.post(
        "/api/auth/delete-account", json={"password": PASSWORD}, headers=auth_headers
    )
    assert res.status_code == 204, res.text

    assert await _rows_for(db, user.id) == 0
    assert await db.get(User, user.id) is None


async def test_the_token_stops_working_afterwards(client, user, auth_headers):
    await client.post("/api/auth/delete-account", json={"password": PASSWORD}, headers=auth_headers)
    res = await client.get("/api/auth/me", headers=auth_headers)
    assert res.status_code == 401


async def test_wrong_password_is_refused_and_deletes_nothing(client, db, user, auth_headers):
    await _populate(client, db, user, auth_headers)
    before = await _rows_for(db, user.id)

    res = await client.post(
        "/api/auth/delete-account", json={"password": "not-my-password"}, headers=auth_headers
    )
    assert res.status_code == 403
    assert await db.get(User, user.id) is not None
    assert await _rows_for(db, user.id) == before


async def test_requires_authentication(client, user):
    res = await client.post("/api/auth/delete-account", json={"password": PASSWORD})
    assert res.status_code == 401


async def test_does_not_touch_another_account(client, db, user, auth_headers, make_user):
    other = await make_user("other@example.com", password="another-password")
    other_headers = {"Authorization": f"Bearer {create_access_token(other)}"}
    await _populate(client, db, other, other_headers)
    other_rows = await _rows_for(db, other.id)
    assert other_rows > 0

    await _populate(client, db, user, auth_headers)
    res = await client.post(
        "/api/auth/delete-account", json={"password": PASSWORD}, headers=auth_headers
    )
    assert res.status_code == 204

    assert await db.get(User, other.id) is not None
    assert await _rows_for(db, other.id) == other_rows


async def test_a_failed_delete_does_not_lock_the_account_out(client, user, auth_headers):
    """Wrong password here is a confirmation typo by someone already signed in,
    not a login attempt. Counting it toward the login lockout would let a
    fumbled delete lock you out of your own account."""
    for _ in range(6):
        res = await client.post(
            "/api/auth/delete-account", json={"password": "wrong"}, headers=auth_headers
        )
        assert res.status_code == 403

    login = await client.post(
        "/api/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert login.status_code == 200


def test_every_user_owned_table_is_covered():
    """The guard that keeps this correct as the schema grows.

    user_owned_tables() reads the model metadata, so a model added later is
    included automatically. This asserts that the discovery actually matches
    the schema -- if it ever silently returned nothing, every other test here
    would still pass while deleting almost nothing.
    """
    discovered = {t.name for t in user_owned_tables()}
    expected = {
        table.name
        for table in Base.metadata.sorted_tables
        if "user_id" in table.c and table.name != "users"
    }
    assert discovered == expected
    # Sanity floor: the tables that exist today and hold personal data.
    assert {
        "events",
        "habits",
        "goals",
        "interests",
        "outlook_connections",
        "google_calendar_connections",
        "email_codes",
        "tts_usage",
        "briefing_usage",
        "chat_usage",
    } <= discovered
