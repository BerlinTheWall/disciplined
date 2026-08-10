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

import re
from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings

ALGORITHM = "HS256"
TTL_MINUTES = 10

# Same trusted-origin shape as main.py's CORS allow_origin_regex — a web
# client (the Vite dev server; there's no deployed production web origin)
# passes its own origin as return_to so the OAuth callback can redirect back
# to it instead of the native app's custom URL scheme. Validated against
# this pattern so a crafted return_to can't turn the callback into an open
# redirect to an arbitrary site.
_RETURN_TO_PATTERN = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")


def _signing_key(purpose: str) -> str:
    return f"{settings.jwt_secret}|{purpose}"


def sanitize_return_to(value: str | None) -> str | None:
    if value and _RETURN_TO_PATTERN.match(value):
        return value
    return None


def create_state_token(purpose: str, user_id: str, return_to: str | None = None) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=TTL_MINUTES)
    payload: dict = {"sub": user_id, "purpose": purpose, "exp": expires}
    if return_to:
        payload["return_to"] = return_to
    return jwt.encode(payload, _signing_key(purpose), algorithm=ALGORITHM)


def verify_state_token(purpose: str, token: str) -> tuple[str, str | None]:
    """Returns (disciplined user_id, return_to) for the OAuth attempt this
    state token started, or raises jwt.InvalidTokenError/ExpiredSignatureError.
    return_to is None for a native-app-initiated attempt (see
    lib/outlookAuth.ts/googleCalendarAuth.ts's connect functions)."""
    payload = jwt.decode(token, _signing_key(purpose), algorithms=[ALGORITHM])
    if payload.get("purpose") != purpose:
        raise jwt.InvalidTokenError("wrong token purpose")
    return payload["sub"], payload.get("return_to")
