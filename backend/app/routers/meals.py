from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Meal
from app.schemas import MealCreate, MealOut, MealUpdate

router = APIRouter(prefix="/api/meals", tags=["meals"])


async def get_meal_or_404(meal_id: str, db: AsyncSession) -> Meal:
    meal = await db.get(Meal, meal_id)
    if meal is None:
        raise HTTPException(status_code=404, detail="Meal not found")
    return meal


@router.get("", response_model=list[MealOut])
async def list_meals(
    start: str | None = None,
    end: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Meal)
    if start:
        query = query.where(Meal.date >= start)
    if end:
        query = query.where(Meal.date <= end)
    return (await db.scalars(query.order_by(Meal.date))).all()


@router.post("", response_model=MealOut, status_code=201)
async def create_meal(body: MealCreate, db: AsyncSession = Depends(get_db)):
    meal = Meal(**body.model_dump())
    db.add(meal)
    await db.commit()
    return meal


@router.get("/{meal_id}", response_model=MealOut)
async def get_meal(meal_id: str, db: AsyncSession = Depends(get_db)):
    return await get_meal_or_404(meal_id, db)


@router.patch("/{meal_id}", response_model=MealOut)
async def update_meal(meal_id: str, body: MealUpdate, db: AsyncSession = Depends(get_db)):
    meal = await get_meal_or_404(meal_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(meal, field, value)
    await db.commit()
    return meal


@router.delete("/{meal_id}", status_code=204)
async def delete_meal(meal_id: str, db: AsyncSession = Depends(get_db)):
    meal = await get_meal_or_404(meal_id, db)
    await db.delete(meal)
    await db.commit()
