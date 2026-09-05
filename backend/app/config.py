import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# asyncpg is not libpq: it rejects the libpq-style query params that hosted
# providers tack onto their connection strings. Strip them and translate the
# one that carries meaning (sslmode) into asyncpg's own `ssl` param.
_LIBPQ_ONLY_PARAMS = {"sslmode", "target_session_attrs", "channel_binding", "gssencmode"}
_SSLMODE_REQUIRES_TLS = {"require", "verify-ca", "verify-full"}
_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


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

    host = (parts.hostname or "").lower()
    # asyncpg's `ssl` param, when given a string, validates it against
    # libpq's own sslmode enum (disable/allow/prefer/require/verify-ca/
    # verify-full) — passing anything else (e.g. the literal string "true")
    # raises ClientConfigurationError. "require" encrypts without demanding
    # a CA-trusted certificate, which is what a hosted provider's internal
    # network needs (its cert is typically self-signed/internal, not from a
    # public CA). Requested when the URL already said so explicitly, or —
    # belt and suspenders — whenever the host isn't loopback: a provider URL
    # with no sslmode at all, or "prefer"/"allow" (which silently accept
    # plaintext), would otherwise connect unencrypted with nothing surfacing
    # that. An explicit sslmode=disable is still honored as a deliberate,
    # informed opt-out (e.g. a known-private network) rather than overridden.
    wants_tls = sslmode in _SSLMODE_REQUIRES_TLS or (
        host not in _LOOPBACK_HOSTS and sslmode != "disable"
    )
    if wants_tls:
        params["ssl"] = "require"

    return urlunsplit(
        ("postgresql+asyncpg", parts.netloc, parts.path, urlencode(params), parts.fragment)
    )


class Settings(BaseSettings):
    gemini_api_key: str = ""
    # Default is flash — flash-lite previously kept asking for details instead
    # of calling tools, and claimed changes it never made (see chat history).
    # Currently overridden to flash-lite via GEMINI_MODEL in .env for cost;
    # revisit if tool-calling reliability regresses.
    gemini_model: str = "gemini-2.5-flash-lite"
    # 2.5 Flash "thinks" by default and bills thinking as output tokens — for
    # this tool-calling workload it adds cost, not quality. 0 disables; raise
    # (or set -1 for dynamic) if scheduling answers ever get noticeably worse.
    gemini_thinking_budget: int = 0
    # Natural-voice reminders, via Azure AI Speech (a dedicated TTS API — far
    # lower latency and cost than routing audio through a generative model).
    # Create a Speech resource in the Azure portal (Free F0 tier covers this
    # comfortably), then use its key and region here.
    azure_speech_key: str = ""
    azure_speech_region: str = ""
    # Any Neural/HD voice name works; the language code is derived from it
    # (e.g. "en-US-Ava:DragonHDLatestNeural" -> "en-US"). Full list:
    # https://speech.microsoft.com/portal/voicegallery
    azure_tts_voice: str = "en-US-Ava:DragonHDLatestNeural"
    # The cheaper Standard-tier voice ($16/1M chars vs. HD's $22/1M) used for
    # routine TTS (reminders, chat replies, weekly/monthly recaps — see
    # routers/tts.py's purpose split) — high-volume utility speech doesn't
    # need HD's expressiveness, and it's not user-selectable like the HD
    # voice is (Settings > Voice), so there's no personality to preserve.
    azure_tts_voice_standard: str = "en-US-AriaNeural"
    # Transactional email (verification codes, password reset) via Resend's
    # HTTP API. Blank in dev is fine — services/email.py falls back to
    # logging the email instead of sending it, so signup/reset stay testable
    # without an account. Get a key at https://resend.com/api-keys.
    resend_api_key: str = ""
    # Resend's shared sandbox sender works with no domain setup but can only
    # send to the address you signed up with — verify a domain and switch
    # this once real users need to receive mail.
    email_from: str = "Disciplined <onboarding@resend.dev>"
    # Railway injects DATABASE_URL; docker-compose.yml serves the local default.
    database_url: str = "postgresql+asyncpg://disciplined:disciplined@localhost:5432/disciplined"
    # Signs auth tokens — set a long random value in .env for anything public.
    jwt_secret: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 30  # 30 days; no refresh-token flow
    # Microsoft Graph OAuth (Settings > Connected Calendars > Outlook) — an app
    # registration in the Microsoft Entra admin center: Calendars.ReadWrite,
    # offline_access, User.Read delegated permissions, redirect URI set to
    # this backend's /api/outlook/callback. Blank in dev disables the feature
    # (routers/outlook.py returns a clear error rather than a broken flow).
    ms_graph_client_id: str = ""
    ms_graph_client_secret: str = ""
    ms_graph_redirect_uri: str = ""
    # Google Calendar OAuth (Settings > Connected Calendars > Google) — a
    # Google Cloud project with the Calendar API enabled and an OAuth Client
    # ID (Web application), redirect URI set to this backend's
    # /api/google-calendar/callback. Same shape as the MS_GRAPH_* settings
    # above; blank disables the feature the same way.
    google_calendar_client_id: str = ""
    google_calendar_client_secret: str = ""
    google_calendar_redirect_uri: str = ""
    # Encrypts stored Microsoft/Google access/refresh tokens at rest
    # (services/crypto.py), shared across both providers.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    token_encryption_key: str = ""
    # Vite dev server origins, plus the deployed web frontend (Railway) for
    # testing the OAuth calendar connections end-to-end without a native build.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost",
        "capacitor://localhost",  # packaged iOS app WebView origin
        "https://disciplined-production.up.railway.app",
    ]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        return normalize_database_url(value)


settings = Settings()

_DEFAULT_JWT_SECRET = "dev-secret-change-me"
# RAILWAY_ENVIRONMENT_NAME is auto-injected by Railway on every deployed
# service — a reliable "this isn't someone's laptop" signal with zero extra
# config. Local dev (where that var is absent) can still run with the
# built-in default; a real deploy can't, so a forgotten JWT_SECRET fails
# loudly at boot instead of quietly shipping a forgeable signing key.
if settings.jwt_secret == _DEFAULT_JWT_SECRET and os.environ.get("RAILWAY_ENVIRONMENT_NAME"):
    raise RuntimeError(
        "JWT_SECRET is still the built-in default while running on Railway "
        "(RAILWAY_ENVIRONMENT_NAME is set) — refusing to start with a forgeable "
        "signing key. Set a real JWT_SECRET in this service's environment variables "
        '(generate one with: python -c "import secrets; print(secrets.token_hex(32))").'
    )
