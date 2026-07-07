from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import Event, Habit, Meal, User, WorkoutSession
from app.schemas import AuthResponse, LoginRequest, RegisterRequest, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _adopt_orphan_rows(db: AsyncSession, user_id: str) -> None:
    """Data created before accounts existed has no owner; hand it to the first
    registered user so nothing disappears on upgrade."""
    for model in (Event, Habit, WorkoutSession, Meal):
        await db.execute(update(model).where(model.user_id.is_(None)).values(user_id=user_id))


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    is_first_user = (await db.scalar(select(func.count()).select_from(User))) == 0
    user = User(
        email=email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name.strip(),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(user)
    await db.flush()  # assign user.id before adopting rows
    if is_first_user:
        await _adopt_orphan_rows(db, user.id)
    await db.commit()
    return AuthResponse(token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.hashed_password):
        # One message for both cases so the endpoint doesn't reveal which emails exist.
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return AuthResponse(token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
