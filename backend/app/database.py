import asyncio
from collections.abc import AsyncGenerator
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# pool_pre_ping: hosted Postgres (and anything behind a proxy) silently drops
# idle connections; without this the first request after a quiet spell fails.
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


class Base(DeclarativeBase):
    pass


def _upgrade_to_head() -> None:
    config = Config(_ALEMBIC_INI)
    command.upgrade(config, "head")


async def init_db() -> None:
    """Bring the schema up to date on startup.

    Alembic is synchronous and blocking, so it runs in a worker thread rather
    than stalling the event loop. Fine for a single instance; if this ever runs
    with more than one replica, move it to a release/pre-deploy command instead
    so concurrent boots can't race each other into the same migration.
    """
    await asyncio.to_thread(_upgrade_to_head)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
