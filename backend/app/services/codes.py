"""One-time email codes: issue and verify, shared by the email-verification
and password-reset flows in routers/auth.py."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EmailCode

CODE_TTL_MINUTES = 15
MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def _latest(db: AsyncSession, user_id: str, purpose: str) -> EmailCode | None:
    return await db.scalar(
        select(EmailCode)
        .where(EmailCode.user_id == user_id, EmailCode.purpose == purpose)
        .order_by(EmailCode.created_at.desc())
        .limit(1)
    )


async def seconds_until_resend(db: AsyncSession, user_id: str, purpose: str) -> int:
    """0 if a new code can be issued now, otherwise how much longer to wait."""
    last = await _latest(db, user_id, purpose)
    if last is None:
        return 0
    elapsed = (_now() - datetime.fromisoformat(last.created_at)).total_seconds()
    return max(0, int(RESEND_COOLDOWN_SECONDS - elapsed))


async def issue_code(db: AsyncSession, user_id: str, purpose: str) -> str:
    """Creates and stores a new code, returning the plaintext to email out."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        EmailCode(
            user_id=user_id,
            purpose=purpose,
            code_hash=_hash(code),
            expires_at=(_now() + timedelta(minutes=CODE_TTL_MINUTES)).isoformat(),
            created_at=_now().isoformat(),
        )
    )
    return code


async def consume_code(db: AsyncSession, user_id: str, purpose: str, code: str) -> bool:
    """Checks `code` against the latest unconsumed code of that purpose,
    counting the attempt either way (so guessing is capped even on a miss).
    Returns whether it matched a live, unexpired code."""
    record = await db.scalar(
        select(EmailCode)
        .where(
            EmailCode.user_id == user_id,
            EmailCode.purpose == purpose,
            EmailCode.consumed.is_(False),
        )
        .order_by(EmailCode.created_at.desc())
        .limit(1)
    )
    if record is None:
        return False
    if record.attempts >= MAX_ATTEMPTS or datetime.fromisoformat(record.expires_at) < _now():
        return False
    record.attempts += 1
    if record.code_hash != _hash(code):
        return False
    record.consumed = True
    return True
