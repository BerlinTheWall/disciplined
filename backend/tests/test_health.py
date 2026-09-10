"""Liveness and readiness.

These matter more than they look: the frontend service answers every path with
its SPA shell, so a naive "GET /api/health returned 200" smoke test passes
against a completely dead backend. The deploy check asserts on the JSON body,
and these tests are what keep that body's shape stable.
"""

from unittest.mock import patch


async def test_liveness_is_ok(client):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


async def test_readiness_reports_ok_and_a_release(client):
    res = await client.get("/api/health/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    # Present as a key even locally, where there is no commit to report.
    assert "release" in body


async def test_readiness_is_503_when_the_database_is_unreachable(client):
    """The whole point of a separate readiness probe: it must actually fail
    when the thing it checks is broken."""
    with patch("app.main.text", side_effect=RuntimeError("connection refused")):
        res = await client.get("/api/health/ready")
    assert res.status_code == 503
    assert res.json()["status"] == "degraded"
    assert res.json()["database"] == "unreachable"


async def test_liveness_survives_a_broken_database(client):
    """Liveness must NOT depend on the database — a probe that does turns a
    brief blip into a restart loop, which is worse than the blip."""
    with patch("app.main.text", side_effect=RuntimeError("connection refused")):
        res = await client.get("/api/health")
    assert res.status_code == 200
