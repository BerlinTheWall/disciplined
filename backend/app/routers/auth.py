from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import Event, Habit, Meal, User, WorkoutSession
from app.schemas import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    UpdateTimezoneRequest,
    UserOut,
    VerifyEmailRequest,
)
from app.services.codes import consume_code, issue_code, seconds_until_resend
from app.services.email import code_email_html, send_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _adopt_orphan_rows(db: AsyncSession, user_id: str) -> None:
    """Data created before accounts existed has no owner; hand it to the first
    registered user so nothing disappears on upgrade."""
    for model in (Event, Habit, WorkoutSession, Meal):
        await db.execute(update(model).where(model.user_id.is_(None)).values(user_id=user_id))


async def _send_code(
    db: AsyncSession,
    background: BackgroundTasks,
    user: User,
    purpose: str,
    subject: str,
    action: str,
) -> None:
    code = await issue_code(db, user.id, purpose)
    await db.commit()
    background.add_task(send_email, user.email, subject, code_email_html(code, action))


@router.post("/register", response_model=MessageResponse, status_code=201)
async def register(
    body: RegisterRequest, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
):
    email = body.email.lower()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    is_first_user = (await db.scalar(select(func.count()).select_from(User))) == 0
    first_name = body.first_name.strip()
    last_name = body.last_name.strip()
    user = User(
        email=email,
        hashed_password=hash_password(body.password),
        first_name=first_name,
        last_name=last_name,
        display_name=f"{first_name} {last_name}".strip(),
        created_at=datetime.now(timezone.utc).isoformat(),
        timezone=body.timezone,
    )
    db.add(user)
    await db.flush()  # assign user.id before adopting rows
    if is_first_user:
        await _adopt_orphan_rows(db, user.id)
    await db.commit()
    # Hard-gated: no token yet. The account can't be used — including logging
    # in — until the code just emailed comes back through /verify-email.
    await _send_code(
        db, background, user, "verify", "Verify your email",
        "Enter this code in Disciplined to verify your email:",
    )
    return MessageResponse(message="Account created — check your email for a verification code.")


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.hashed_password):
        # One message for both cases so the endpoint doesn't reveal which emails exist.
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.email_verified:
        # 403 (not 401): the credentials are correct, the account just isn't
        # usable yet — the frontend uses this status to route straight to the
        # verify-code sheet instead of showing a generic error.
        raise HTTPException(status_code=403, detail="Verify your email before logging in.")
    return AuthResponse(token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/verify-email", response_model=AuthResponse)
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Public by design (email + code, no bearer token) — this is the only
    way in for an account that isn't verified yet, so it can't require the
    session it's meant to grant. Security rests entirely on consume_code:
    a valid code, tied to this user, unexpired and not already used."""
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None:
        raise HTTPException(status_code=400, detail="Incorrect or expired code")
    ok = await consume_code(db, user.id, "verify", body.code)
    if not ok:
        await db.commit()  # persist the attempt count even on a miss
        raise HTTPException(status_code=400, detail="Incorrect or expired code")
    user.email_verified = True
    await db.commit()
    return AuthResponse(token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    body: ResendVerificationRequest, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
):
    # Same response regardless of whether the email exists or is already
    # verified — don't leak either fact to an unauthenticated caller.
    generic = MessageResponse(message="If that email needs verifying, a new code is on its way.")
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or user.email_verified:
        return generic
    if await seconds_until_resend(db, user.id, "verify") > 0:
        return generic
    await _send_code(
        db, background, user, "verify", "Verify your email",
        "Enter this code in Disciplined to verify your email:",
    )
    return generic


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    body: ForgotPasswordRequest, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
):
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None:
        raise HTTPException(status_code=404, detail="No account found with that email.")
    if await seconds_until_resend(db, user.id, "reset") > 0:
        return MessageResponse(message="A reset code was already sent — check your email.")
    await _send_code(
        db, background, user, "reset", "Reset your password",
        "Enter this code in Disciplined to reset your password:",
    )
    return MessageResponse(message="A reset code has been sent to your email.")


@router.post("/reset-password", response_model=AuthResponse)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None:
        raise HTTPException(status_code=400, detail="Incorrect or expired code")
    ok = await consume_code(db, user.id, "reset", body.code)
    if not ok:
        await db.commit()
        raise HTTPException(status_code=400, detail="Incorrect or expired code")
    user.hashed_password = hash_password(body.new_password)
    # Successfully using a code mailed to this address is itself proof of
    # ownership — piggyback the verification instead of making them do both.
    user.email_verified = True
    await db.commit()
    return AuthResponse(token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.patch("/timezone", response_model=UserOut)
async def update_timezone(
    body: UpdateTimezoneRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.timezone = body.timezone
    await db.commit()
    return user
