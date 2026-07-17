from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# asyncpg is not libpq: it rejects the libpq-style query params that hosted
# providers tack onto their connection strings. Strip them and translate the
# one that carries meaning (sslmode) into asyncpg's own `ssl` param.
_LIBPQ_ONLY_PARAMS = {"sslmode", "target_session_attrs", "channel_binding", "gssencmode"}
_SSLMODE_REQUIRES_TLS = {"require", "verify-ca", "verify-full"}


def normalize_database_url(url: str) -> str:
    """Turn a provider-issued Postgres URL into one SQLAlchemy+asyncpg accepts.

    Railway (and Heroku, Neon, Supabase, …) hand out `postgresql://…` — the sync
    libpq form. SQLAlchemy picks its driver from the scheme, so that string
    silently selects psycopg2 and blows up under an async engine. Rewrite the
    scheme, and drop the libpq-only query params asyncpg would choke on.
    """
    parts = urlsplit(url)
    if parts.scheme not in ("postgres", "postgresql"):
        return url  # already driver-qualified, or sqlite — leave it alone

    params = dict(parse_qsl(parts.query))
    sslmode = params.get("sslmode")
    for key in _LIBPQ_ONLY_PARAMS:
        params.pop(key, None)
    # asyncpg spells it `ssl`; anything short of `require` is its default anyway.
    if sslmode in _SSLMODE_REQUIRES_TLS:
        params["ssl"] = "true"

    return urlunsplit(
        ("postgresql+asyncpg", parts.netloc, parts.path, urlencode(params), parts.fragment)
    )


class Settings(BaseSettings):
    gemini_api_key: str = ""
    # flash rather than flash-lite: lite kept asking for details instead of
    # calling tools, and claimed changes it never made (see chat history).
    gemini_model: str = "gemini-2.5-flash"
    # 2.5 Flash "thinks" by default and bills thinking as output tokens — for
    # this tool-calling workload it adds cost, not quality. 0 disables; raise
    # (or set -1 for dynamic) if scheduling answers ever get noticeably worse.
    gemini_thinking_budget: int = 0
    # Natural-voice reminders. Voice names: Zephyr (bright), Puck (upbeat),
    # Aoede (breezy), Kore (firm), Leda (youthful), Charon (informative), …
    gemini_tts_model: str = "gemini-2.5-flash-preview-tts"
    gemini_tts_voice: str = "Zephyr"
    # Railway injects DATABASE_URL; docker-compose.yml serves the local default.
    database_url: str = "postgresql+asyncpg://disciplined:disciplined@localhost:5432/disciplined"
    # Signs auth tokens — set a long random value in .env for anything public.
    jwt_secret: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 30  # 30 days; no refresh-token flow
    # Vite dev server origins
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost",
        "capacitor://localhost",  # packaged iOS app WebView origin
    ]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        return normalize_database_url(value)


settings = Settings()
