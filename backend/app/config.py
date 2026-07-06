from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gemini_api_key: str = ""
    # flash rather than flash-lite: lite kept asking for details instead of
    # calling tools, and claimed changes it never made (see chat history).
    gemini_model: str = "gemini-2.5-flash"
    database_url: str = "sqlite+aiosqlite:///./disciplined.db"
    # Vite dev server + Capacitor webview origins
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "capacitor://localhost",
        "http://localhost",
    ]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
