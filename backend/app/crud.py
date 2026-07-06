from typing import TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base

T = TypeVar("T", bound=Base)


async def upsert(db: AsyncSession, model: type[T], data: dict) -> T:
    """Create a row, honoring a client-supplied id; update in place if it exists.

    The frontend generates ids locally for optimistic UI and may retry a create,
    so POST is idempotent rather than erroring on an existing id.
    """
    item_id = data.pop("id", None)
    if item_id:
        existing = await db.get(model, item_id)
        if existing is not None:
            for field, value in data.items():
                setattr(existing, field, value)
            await db.commit()
            return existing
        data["id"] = item_id
    obj = model(**data)
    db.add(obj)
    await db.commit()
    return obj
