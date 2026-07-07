from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base

T = TypeVar("T", bound=Base)


async def upsert(db: AsyncSession, model: type[T], data: dict, user_id: str) -> T:
    """Create a row for the user, honoring a client-supplied id; update in
    place if that row already exists.

    The frontend generates ids locally for optimistic UI and may retry a create,
    so POST is idempotent rather than erroring on an existing id.
    """
    item_id = data.pop("id", None)
    if item_id:
        existing = await db.get(model, item_id)
        if existing is not None:
            # Another user's row under this id: report not-found rather than
            # updating (or revealing) someone else's data.
            if existing.user_id != user_id:
                raise HTTPException(status_code=404, detail="Not found")
            for field, value in data.items():
                setattr(existing, field, value)
            await db.commit()
            return existing
        data["id"] = item_id
    obj = model(**data, user_id=user_id)
    db.add(obj)
    await db.commit()
    return obj
