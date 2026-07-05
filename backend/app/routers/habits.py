from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Habit
from app.schemas import HabitCreate, HabitOut, HabitUpdate

router = APIRouter(prefix="/api/habits", tags=["habits"])


async def get_habit_or_404(habit_id: str, db: AsyncSession) -> Habit:
    habit = await db.get(Habit, habit_id)
    if habit is None:
        raise HTTPException(status_code=404, detail="Habit not found")
    return habit


@router.get("", response_model=list[HabitOut])
async def list_habits(db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Habit).order_by(Habit.start_minutes))).all()


@router.post("", response_model=HabitOut, status_code=201)
async def create_habit(body: HabitCreate, db: AsyncSession = Depends(get_db)):
    habit = Habit(**body.model_dump())
    db.add(habit)
    await db.commit()
    return habit


@router.get("/{habit_id}", response_model=HabitOut)
async def get_habit(habit_id: str, db: AsyncSession = Depends(get_db)):
    return await get_habit_or_404(habit_id, db)


@router.patch("/{habit_id}", response_model=HabitOut)
async def update_habit(habit_id: str, body: HabitUpdate, db: AsyncSession = Depends(get_db)):
    habit = await get_habit_or_404(habit_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(habit, field, value)
    await db.commit()
    return habit


@router.delete("/{habit_id}", status_code=204)
async def delete_habit(habit_id: str, db: AsyncSession = Depends(get_db)):
    habit = await get_habit_or_404(habit_id, db)
    await db.delete(habit)
    await db.commit()
