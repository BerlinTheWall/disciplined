"""Login, lockout and token invalidation.

These cover the paths where a bug is a security bug rather than a broken
feature, so they assert the behaviour rather than the implementation.
"""

from app.auth import create_access_token
from app.routers.auth import LOGIN_MAX_ATTEMPTS

PASSWORD = "correct-horse-battery"


async def _login(client, email="test@example.com", password=PASSWORD):
    return await client.post("/api/auth/login", json={"email": email, "password": password})


async def test_login_with_correct_password_returns_a_token(client, user):
    res = await _login(client)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token"]
    assert body["user"]["email"] == "test@example.com"
    # The password must never come back out, in any form.
    assert "hashedPassword" not in body["user"]
    assert "hashed_password" not in body["user"]


async def test_login_with_wrong_password_is_rejected(client, user):
    res = await _login(client, password="wrong")
    assert res.status_code == 401


async def test_login_does_not_reveal_whether_an_email_exists(client, user):
    """An attacker must not be able to enumerate accounts by comparing the
    responses for a known and an unknown address."""
    unknown = await _login(client, email="nobody@example.com", password="wrong")
    known = await _login(client, password="wrong")
    assert unknown.status_code == known.status_code == 401
    assert unknown.json()["detail"] == known.json()["detail"]


async def test_email_is_matched_case_insensitively(client, user):
    res = await _login(client, email="TEST@EXAMPLE.COM")
    assert res.status_code == 200


async def test_account_locks_after_repeated_failures(client, user):
    for _ in range(LOGIN_MAX_ATTEMPTS - 1):
        assert (await _login(client, password="wrong")).status_code == 401
    # The attempt that crosses the threshold locks rather than just failing.
    assert (await _login(client, password="wrong")).status_code == 429
    # And the lock holds even against the correct password — otherwise it
    # protects nothing, since guessing right is the attacker's goal.
    assert (await _login(client)).status_code == 429


async def test_a_successful_login_clears_earlier_failures(client, user):
    for _ in range(LOGIN_MAX_ATTEMPTS - 1):
        await _login(client, password="wrong")
    assert (await _login(client)).status_code == 200
    # Counter reset: a fresh run of failures should get the full allowance
    # again rather than locking on the first one.
    for _ in range(LOGIN_MAX_ATTEMPTS - 1):
        assert (await _login(client, password="wrong")).status_code == 401


async def test_unverified_account_cannot_log_in(client, db, make_user):
    account = await make_user("unverified@example.com", password=PASSWORD)
    account.email_verified = False
    await db.commit()
    res = await _login(client, email="unverified@example.com")
    # 403, not 401: the credentials were right, the account just isn't usable
    # yet — the frontend routes on this status.
    assert res.status_code == 403


async def test_me_returns_the_signed_in_account(client, auth_headers, user):
    res = await client.get("/api/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == user.email


async def test_me_rejects_a_forged_token(client, user):
    res = await client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.token"})
    assert res.status_code == 401


async def test_logout_everywhere_invalidates_existing_tokens(client, auth_headers, user):
    """The whole point of the token_version claim: a leaked token must stop
    working without having to rotate JWT_SECRET for every user."""
    old_token = auth_headers["Authorization"]
    res = await client.post("/api/auth/logout-everywhere", headers=auth_headers)
    assert res.status_code == 200
    new_token = res.json()["token"]

    stale = await client.get("/api/auth/me", headers={"Authorization": old_token})
    assert stale.status_code == 401

    fresh = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_token}"})
    assert fresh.status_code == 200


async def test_a_token_for_a_deleted_account_is_rejected(client, db, make_user):
    ghost = await make_user("ghost@example.com")
    token = create_access_token(ghost)
    await db.delete(ghost)
    await db.commit()
    res = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
