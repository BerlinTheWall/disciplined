from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.crud import upsert
from app.database import get_db
from app.models import Interest, User
from app.schemas import InterestCreate, InterestOut

router = APIRouter(prefix="/api/interests", tags=["interests"])


@router.get("", response_model=list[InterestOut])
async def list_interests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Interest).where(Interest.user_id == user.id).order_by(Interest.created_at)
    return (await db.scalars(query)).all()


@router.post("", response_model=InterestOut, status_code=201)
async def create_interest(
    body: InterestCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await upsert(db, Interest, body.model_dump(), user.id)


@router.delete("/{interest_id}", status_code=204)
async def delete_interest(
    interest_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    interest = await db.get(Interest, interest_id)
    if interest is None or interest.user_id != user.id:
        raise HTTPException(status_code=404, detail="Interest not found")
    await db.delete(interest)
    await db.commit()
