"""Event CRUD, and the boundary between one account's data and another's.

The isolation tests matter more than the CRUD ones: every route resolves the
row by id first and ownership second, so a missing `user_id` check reads as a
working feature right up until someone else's calendar comes back.
"""

from app.auth import create_access_token


def _event(**overrides):
    body = {
        "title": "Dentist",
        "date": "2026-08-10",
        "startMinutes": 600,
        "durationMinutes": 60,
    }
    body.update(overrides)
    return body


async def test_create_and_read_back(client, auth_headers):
    created = await client.post("/api/events", json=_event(), headers=auth_headers)
    assert created.status_code == 201, created.text
    event_id = created.json()["id"]

    fetched = await client.get(f"/api/events/{event_id}", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Dentist"


async def test_list_filters_by_date_range(client, auth_headers):
    for date in ("2026-08-01", "2026-08-10", "2026-08-20"):
        await client.post("/api/events", json=_event(date=date), headers=auth_headers)

    res = await client.get("/api/events?start=2026-08-05&end=2026-08-15", headers=auth_headers)
    assert res.status_code == 200
    assert [e["date"] for e in res.json()] == ["2026-08-10"]


async def test_list_is_ordered_by_date_then_start_time(client, auth_headers):
    await client.post("/api/events", json=_event(date="2026-08-10", startMinutes=900), headers=auth_headers)
    await client.post("/api/events", json=_event(date="2026-08-10", startMinutes=540), headers=auth_headers)
    await client.post("/api/events", json=_event(date="2026-08-09", startMinutes=1200), headers=auth_headers)

    res = await client.get("/api/events", headers=auth_headers)
    assert [(e["date"], e["startMinutes"]) for e in res.json()] == [
        ("2026-08-09", 1200),
        ("2026-08-10", 540),
        ("2026-08-10", 900),
    ]


async def test_patch_updates_only_the_fields_sent(client, auth_headers):
    created = await client.post("/api/events", json=_event(), headers=auth_headers)
    event_id = created.json()["id"]

    res = await client.patch(
        f"/api/events/{event_id}", json={"completed": True}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["completed"] is True
    # An absent field must not be reset to its default.
    assert res.json()["title"] == "Dentist"


async def test_delete_removes_the_event(client, auth_headers):
    created = await client.post("/api/events", json=_event(), headers=auth_headers)
    event_id = created.json()["id"]

    assert (await client.delete(f"/api/events/{event_id}", headers=auth_headers)).status_code == 204
    assert (await client.get(f"/api/events/{event_id}", headers=auth_headers)).status_code == 404


async def test_rejects_an_out_of_range_start_time(client, auth_headers):
    # startMinutes is a minute-of-day; 1440 is midnight tomorrow, not today.
    res = await client.post("/api/events", json=_event(startMinutes=1440), headers=auth_headers)
    assert res.status_code == 422


async def test_rejects_a_zero_length_event(client, auth_headers):
    res = await client.post("/api/events", json=_event(durationMinutes=0), headers=auth_headers)
    assert res.status_code == 422


# ── Isolation between accounts ──────────────────────────────────────────


async def test_list_never_includes_another_users_events(client, auth_headers, make_user):
    await client.post("/api/events", json=_event(title="Mine"), headers=auth_headers)

    other = await make_user("other@example.com")
    other_headers = {"Authorization": f"Bearer {create_access_token(other)}"}
    await client.post("/api/events", json=_event(title="Theirs"), headers=other_headers)

    mine = await client.get("/api/events", headers=auth_headers)
    assert [e["title"] for e in mine.json()] == ["Mine"]

    theirs = await client.get("/api/events", headers=other_headers)
    assert [e["title"] for e in theirs.json()] == ["Theirs"]


async def test_cannot_read_another_users_event(client, auth_headers, make_user):
    other = await make_user("other@example.com")
    other_headers = {"Authorization": f"Bearer {create_access_token(other)}"}
    created = await client.post("/api/events", json=_event(), headers=other_headers)
    event_id = created.json()["id"]

    # 404 rather than 403: a 403 would confirm the id exists.
    assert (await client.get(f"/api/events/{event_id}", headers=auth_headers)).status_code == 404


async def test_cannot_modify_or_delete_another_users_event(client, auth_headers, make_user):
    other = await make_user("other@example.com")
    other_headers = {"Authorization": f"Bearer {create_access_token(other)}"}
    created = await client.post("/api/events", json=_event(), headers=other_headers)
    event_id = created.json()["id"]

    patched = await client.patch(
        f"/api/events/{event_id}", json={"title": "Hijacked"}, headers=auth_headers
    )
    assert patched.status_code == 404
    assert (await client.delete(f"/api/events/{event_id}", headers=auth_headers)).status_code == 404

    # And the owner's copy is untouched.
    still_there = await client.get(f"/api/events/{event_id}", headers=other_headers)
    assert still_there.status_code == 200
    assert still_there.json()["title"] == "Dentist"
