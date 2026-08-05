"""Encrypts secrets that must be reversible (Microsoft OAuth tokens) — unlike
passwords/verification codes, which are one-way hashed (see app.auth,
models.EmailCode). Nothing else in this app currently stores a reversible
secret at rest.
"""

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class TokenEncryptionNotConfigured(RuntimeError):
    pass


@lru_cache
def _fernet() -> Fernet:
    if not settings.token_encryption_key:
        raise TokenEncryptionNotConfigured(
            "TOKEN_ENCRYPTION_KEY is not set (see backend/.env.example)"
        )
    return Fernet(settings.token_encryption_key.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        # TOKEN_ENCRYPTION_KEY changed (or was never set consistently) since
        # this value was written — treat it as unreadable, not a crash.
        raise ValueError("Stored value can't be decrypted with the current key") from exc
