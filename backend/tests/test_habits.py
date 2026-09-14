"""Habit fields that the app writes but no other test covers."""


def _habit(**overrides):
    body = {
        "title": "Stretch",
        "startMinutes": 420,
        "durationMinutes": 10,
        "daysOfWeek": [1, 3, 5],
    }
    body.update(overrides)
    return body


async def test_description_round_trips_and_survives_partial_updates(client, auth_headers):
    created = await client.post(
        "/api/habits", json=_habit(description="Hamstrings, then hips"), headers=auth_headers
    )
    assert created.status_code == 201, created.text
    habit_id = created.json()["id"]
    assert created.json()["description"] == "Hamstrings, then hips"

    # An update that doesn't mention it (e.g. an app build that predates the
    # field) must leave it alone.
    renamed = await client.patch(
        f"/api/habits/{habit_id}", json={"title": "Stretch well"}, headers=auth_headers
    )
    assert renamed.json()["description"] == "Hamstrings, then hips"

    cleared = await client.patch(
        f"/api/habits/{habit_id}", json={"description": None}, headers=auth_headers
    )
    assert cleared.json()["description"] is None


async def test_description_length_is_capped(client, auth_headers):
    res = await client.post("/api/habits", json=_habit(description="x" * 2001), headers=auth_headers)
    assert res.status_code == 422
