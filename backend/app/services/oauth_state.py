"""Signed, short-lived `state` tokens for third-party OAuth flows (Outlook,
Google Calendar) — round-tripped through a URL to the provider's login page
and back to our own callback, so this is how the callback recovers which
disciplined user started the flow (the callback itself is a plain browser
GET, with no disciplined bearer token attached).

Signed with a key *derived from*, not equal to, the session JWT secret, and
scoped by `purpose` (one per provider) — deliberately so neither a leaked
state token nor a real session token can be replayed as the other, and so
Outlook's state token can't be replayed against Google's callback or vice
versa. A state value is more exposed than a normal request (it sits in
browser history, referrers, and the provider's own logs), so it shouldn't
carry any more power than "resume this one OAuth attempt."
"""

from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings

ALGORITHM = "HS256"
TTL_MINUTES = 10


def _signing_key(purpose: str) -> str:
    return f"{settings.jwt_secret}|{purpose}"


def create_state_token(purpose: str, user_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=TTL_MINUTES)
    return jwt.encode(
        {"sub": user_id, "purpose": purpose, "exp": expires}, _signing_key(purpose), algorithm=ALGORITHM
    )


def verify_state_token(purpose: str, token: str) -> str:
    """Returns the disciplined user_id that started this OAuth attempt, or
    raises jwt.InvalidTokenError/ExpiredSignatureError."""
    payload = jwt.decode(token, _signing_key(purpose), algorithms=[ALGORITHM])
    if payload.get("purpose") != purpose:
        raise jwt.InvalidTokenError("wrong token purpose")
    return payload["sub"]
