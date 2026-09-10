"""Create (or reset) the account the end-to-end tests sign in as.

Signup is not usable from a test: it emails a verification code, and an
unverified account cannot log in. Rather than have the test scrape a code out
of the server log, this writes a verified account directly.

Idempotent — safe to run against a database that already has the account.

    python scripts/seed_e2e_user.py

Refuses to touch anything but a local or explicitly-marked test database, so a
stray run cannot rewrite a real user's password.
"""

import asyncio
import os
import sys

from sqlalchemy import select

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.auth import hash_password  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import Base, engine  # noqa: E402
from app.models import User  # noqa: E402

EMAIL = os.environ.get("E2E_EMAIL", "e2e@example.com")
PASSWORD = os.environ.get("E2E_PASSWORD", "e2e-test-password")

_SAFE_HOSTS = ("localhost", "127.0.0.1", "postgres", "::1")


def _refuse_if_not_local() -> None:
    url = settings.database_url
    if any(f"@{host}" in url for host in _SAFE_HOSTS) or "test" in url.rsplit("/", 1)[-1]:
        return
    raise SystemExit(
        f"Refusing to seed: {url.rsplit('@', 1)[-1]} is neither local nor a database "
        "whose name contains 'test'. This script overwrites an account's password."
    )


async def main() -> None:
    _refuse_if_not_local()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from sqlalchemy.ext.asyncio import async_sessionmaker

    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        user = await db.scalar(select(User).where(User.email == EMAIL))
        if user is None:
            user = User(email=EMAIL, hashed_password="", created_at="2026-01-01T00:00:00+00:00")
            db.add(user)
        # Reset every field the tests depend on, so a half-broken account left
        # by a previous run does not produce a confusing failure.
        user.hashed_password = hash_password(PASSWORD)
        user.display_name = "E2E Tester"
        user.first_name = "E2E"
        user.last_name = "Tester"
        user.email_verified = True
        user.subscription_tier = "pro"
        user.failed_login_attempts = 0
        user.login_locked_until = None
        await db.commit()

    await engine.dispose()
    print(f"seeded {EMAIL}")


if __name__ == "__main__":
    asyncio.run(main())
