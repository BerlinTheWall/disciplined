from pydantic_settings import BaseSettings, SettingsConfigDict


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
    database_url: str = "sqlite+aiosqlite:///./disciplined.db"
    # Signs auth tokens — set a long random value in .env for anything public.
    jwt_secret: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 30  # 30 days; no refresh-token flow
    # Vite dev server + Capacitor webview origins
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "capacitor://localhost",
        "http://localhost",
    ]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
