"""Shared test fixtures: a database, an app wired to it, and signed-in clients.

The database is SQLite in memory by default, so `pytest` works with no
services running and a full suite costs under a second. CI points
TEST_DATABASE_URL at a real Postgres (see .github/workflows/ci.yml) so the
same tests also run against the engine production actually uses.

That dual target is deliberate: it keeps the local loop fast without letting
the suite quietly become "passes on SQLite" only.
"""

import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.pool import StaticPool

from app.auth import create_access_token, hash_password
from app.database import Base, get_db
from app.models import User

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
_IS_SQLITE = TEST_DATABASE_URL.startswith("sqlite")


# The models use Postgres JSONB (habits' completed_dates, goals' milestones,
# ...), which SQLite has no DDL for. It is a subclass of the generic JSON
# type, so the driver already knows how to serialise values -- only the
# CREATE TABLE keyword needs translating.
@compiles(JSONB, "sqlite")
def _jsonb_as_json_on_sqlite(type_, compiler, **kw):  # noqa: ANN001, ANN201
    return "JSON"


@pytest_asyncio.fixture(scope="session")
async def engine():
    if _IS_SQLITE:
        # An in-memory SQLite database belongs to its connection, so a normal
        # pool would hand out connections that each see a different, empty
        # database. StaticPool keeps exactly one.
        eng = create_async_engine(
            TEST_DATABASE_URL,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
    else:
        eng = create_async_engine(TEST_DATABASE_URL)

    async with eng.begin() as conn:
        # create_all, not `alembic upgrade head`: this asserts the app's
        # models, and keeps a broken migration from taking every test with
        # it. Migrations are checked separately (CI's single-head guard).
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncGenerator[AsyncSession, None]:
    """A session for one test, with every table emptied afterwards.

    Truncating between tests rather than rolling back a transaction: the code
    under test commits, and a rollback-based fixture quietly makes those
    commits invisible, which is exactly the kind of difference that produces
    a green suite over broken code.
    """
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    async with sessionmaker() as session:
        yield session

    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest_asyncio.fixture
async def client(db) -> AsyncGenerator[AsyncClient, None]:
    """An HTTP client speaking to the real app over ASGI, no socket involved.

    get_db is overridden so the app and the test share one session and one
    view of the data. ASGITransport does not run lifespan, which is what we
    want -- startup would try to reach the real database and run migrations.
    """
    from app.main import app

    async def _get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def user(db) -> User:
    """A saved, verified account on the default tier."""
    account = User(
        email="test@example.com",
        hashed_password=hash_password("correct-horse-battery"),
        first_name="Test",
        last_name="User",
        display_name="Test User",
        created_at="2026-01-01T00:00:00+00:00",
        email_verified=True,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@pytest.fixture
def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


@pytest_asyncio.fixture
async def make_user(db):
    """Build extra accounts, e.g. to check one user cannot see another's data."""

    async def _make(email: str, *, tier: str = "pro", password: str = "another-password") -> User:
        account = User(
            email=email,
            hashed_password=hash_password(password),
            display_name=email.split("@")[0],
            created_at="2026-01-01T00:00:00+00:00",
            email_verified=True,
            subscription_tier=tier,
        )
        db.add(account)
        await db.commit()
        await db.refresh(account)
        return account

    return _make
