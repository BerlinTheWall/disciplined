"""Subscription-tier gating.

app/tiers.py exists because, as of 2026-09-03, chat/tts/nudges/week_plan and
the goal_* routers had zero tier enforcement despite the Free/Plus/Pro split
being fully designed. These tests are the guard against that silently coming
back: the route-level ones fail if a `Depends(require_tier(...))` is dropped
from a route that is supposed to have one.

No billing exists yet, so accounts default to "pro" and nothing is blocked in
practice. That makes an accidental regression invisible in manual testing --
which is exactly why it needs a test.
"""

import pytest
from fastapi import HTTPException

from app.auth import create_access_token
from app.tiers import require_tier


async def _check(minimum: str, user):
    """Invoke the dependency the way FastAPI would."""
    return await require_tier(minimum)(user=user)


async def _call(client, method: str, path: str, headers: dict | None = None):
    """Hit a route with a body only where the route takes one — httpx's .get()
    rejects `json=`, and a GET carrying a body is not what these routes see in
    production anyway."""
    kwargs = {"headers": headers} if headers else {}
    if method == "post":
        kwargs["json"] = {}
    return await client.request(method.upper(), path, **kwargs)


# ── The dependency itself ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "account_tier,minimum,allowed",
    [
        ("free", "free", True),
        ("free", "plus", False),
        ("free", "pro", False),
        ("plus", "free", True),
        ("plus", "plus", True),
        ("plus", "pro", False),
        ("pro", "free", True),
        ("pro", "plus", True),
        ("pro", "pro", True),
    ],
)
async def test_tier_ranking(make_user, account_tier, minimum, allowed):
    user = await make_user(f"{account_tier}@example.com", tier=account_tier)
    if allowed:
        assert await _check(minimum, user) is user
    else:
        with pytest.raises(HTTPException) as raised:
            await _check(minimum, user)
        # 403, not 401: the caller is correctly authenticated, just not
        # entitled — the frontend routes on that difference.
        assert raised.value.status_code == 403


async def test_an_unknown_tier_is_treated_as_the_lowest(make_user):
    """A tier string the code doesn't recognise (a typo, a value written by a
    future billing integration) must fail closed, not open."""
    user = await make_user("weird@example.com", tier="enterprise-platinum")
    with pytest.raises(HTTPException) as raised:
        await _check("plus", user)
    assert raised.value.status_code == 403


# ── The routes that are supposed to use it ──────────────────────────────

# Gate-only checks: the dependency runs before the handler, so these never
# reach Gemini, Azure or Microsoft Graph and need no API keys.
PLUS_ROUTES = [
    ("post", "/api/briefing"),
    ("post", "/api/chat"),
    ("get", "/api/google-calendar/connect"),
    ("get", "/api/outlook/connect"),
]

PRO_ROUTES = [
    ("post", "/api/coach/plan"),
    ("post", "/api/week-plan"),
    ("post", "/api/nudges/check"),
]


@pytest.mark.parametrize("method,path", PLUS_ROUTES + PRO_ROUTES)
async def test_free_account_is_refused(client, make_user, method, path):
    user = await make_user("free@example.com", tier="free")
    headers = {"Authorization": f"Bearer {create_access_token(user)}"}
    res = await _call(client, method, path, headers)
    assert res.status_code == 403, f"{method.upper()} {path} returned {res.status_code}"


@pytest.mark.parametrize("method,path", PRO_ROUTES)
async def test_plus_account_is_refused_from_pro_routes(client, make_user, method, path):
    user = await make_user("plus@example.com", tier="plus")
    headers = {"Authorization": f"Bearer {create_access_token(user)}"}
    res = await _call(client, method, path, headers)
    assert res.status_code == 403, f"{method.upper()} {path} returned {res.status_code}"


@pytest.mark.parametrize("method,path", PLUS_ROUTES + PRO_ROUTES)
async def test_gated_routes_still_require_authentication(client, method, path):
    """The tier gate must not have replaced the auth check."""
    res = await _call(client, method, path)
    assert res.status_code == 401, f"{method.upper()} {path} returned {res.status_code}"
