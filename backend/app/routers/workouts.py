from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.crud import upsert
from app.database import get_db
from app.models import User, WorkoutSession
from app.schemas import WorkoutSessionCreate, WorkoutSessionOut, WorkoutSessionUpdate

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


async def get_workout_or_404(workout_id: str, db: AsyncSession, user: User) -> WorkoutSession:
    workout = await db.get(WorkoutSession, workout_id)
    if workout is None or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workout session not found")
    return workout


@router.get("", response_model=list[WorkoutSessionOut])
async def list_workouts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .order_by(WorkoutSession.name)
    )
    return (await db.scalars(query)).all()


@router.post("", response_model=WorkoutSessionOut, status_code=201)
async def create_workout(
    body: WorkoutSessionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await upsert(db, WorkoutSession, body.model_dump(), user.id)


@router.get("/{workout_id}", response_model=WorkoutSessionOut)
async def get_workout(
    workout_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_workout_or_404(workout_id, db, user)


@router.patch("/{workout_id}", response_model=WorkoutSessionOut)
async def update_workout(
    workout_id: str,
    body: WorkoutSessionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workout = await get_workout_or_404(workout_id, db, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(workout, field, value)
    await db.commit()
    return workout


@router.delete("/{workout_id}", status_code=204)
async def delete_workout(
    workout_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workout = await get_workout_or_404(workout_id, db, user)
    await db.delete(workout)
    await db.commit()
