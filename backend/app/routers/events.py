from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.crud import upsert
from app.database import get_db
from app.models import Event, User
from app.schemas import EventCreate, EventOut, EventUpdate

router = APIRouter(prefix="/api/events", tags=["events"])


async def get_event_or_404(event_id: str, db: AsyncSession, user: User) -> Event:
    event = await db.get(Event, event_id)
    if event is None or event.user_id != user.id:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.get("", response_model=list[EventOut])
async def list_events(
    start: str | None = None,
    end: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Event).where(Event.user_id == user.id)
    if start:
        query = query.where(Event.date >= start)
    if end:
        query = query.where(Event.date <= end)
    return (await db.scalars(query.order_by(Event.date, Event.start_minutes))).all()


@router.post("", response_model=EventOut, status_code=201)
async def create_event(
    body: EventCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await upsert(db, Event, body.model_dump(), user.id)


@router.get("/{event_id}", response_model=EventOut)
async def get_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_event_or_404(event_id, db, user)


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: str,
    body: EventUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = await get_event_or_404(event_id, db, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    await db.commit()
    return event


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = await get_event_or_404(event_id, db, user)
    await db.delete(event)
    await db.commit()
