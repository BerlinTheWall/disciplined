import asyncio
import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

log = logging.getLogger("app.database")

# connect timeout: without it, an unreachable host makes startup hang forever
# with no log line — the healthcheck kills the container and you get a silent
# restart loop that says nothing about what is wrong. Fail in 10s and say so.
#
# pool_pre_ping: hosted Postgres (and anything behind a proxy) silently drops
# idle connections; without this the first request after a quiet spell fails.
engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"timeout": 10},
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


class Base(DeclarativeBase):
    pass


def _upgrade_to_head() -> None:
    config = Config(_ALEMBIC_INI)
    command.upgrade(config, "head")


async def _check_connection() -> None:
    """Connect once, loudly, before Alembic gets a turn.

    Alembic's own failures surface as a wall of SQLAlchemy stack frames (or, if
    the host simply never answers, as nothing at all). Getting the connection
    error on its own terms first makes a misconfigured DATABASE_URL obvious.
    """
    url = make_url(settings.database_url)
    target = f"{url.host}:{url.port or 5432}/{url.database}"
    log.info("connecting to %s as %s", target, url.username)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        log.error("cannot reach the database at %s — %s: %s", target, type(e).__name__, e)
        raise
    log.info("database ok")


async def init_db() -> None:
    """Bring the schema up to date on startup.

    Alembic is synchronous and blocking, so it runs in a worker thread rather
    than stalling the event loop. Fine for a single instance; if this ever runs
    with more than one replica, move it to a release/pre-deploy command instead
    so concurrent boots can't race each other into the same migration.
    """
    await _check_connection()
    await asyncio.to_thread(_upgrade_to_head)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
