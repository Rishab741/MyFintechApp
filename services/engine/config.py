from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str
    supabase_service_role_key: str   # bypasses RLS — never expose to clients
    supabase_jwt_secret: str         # used to validate user JWTs locally

    # ── Engine ────────────────────────────────────────────────────────────────
    # Secret that Supabase edge functions / pg_cron use to call the engine.
    # Clients (mobile app) use their own Supabase JWT instead.
    engine_service_key: str

    # ── Yahoo Finance ─────────────────────────────────────────────────────────
    # No API key required — Yahoo Finance is queried via its public endpoints.
    # Set a custom user-agent to reduce rate-limit probability.
    yahoo_user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    )
    yahoo_timeout_s: float = 10.0

    # ── Benchmark ─────────────────────────────────────────────────────────────
    default_benchmark: str = "SPY"
    risk_free_rate_annual: float = 0.045   # 4.5% — update when Fed rate changes

    # ── Server ────────────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    log_level: str = "info"

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins.
    # In production: your Expo app's origin + web dashboard URL.
    allowed_origins: str = "*"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def risk_free_rate_daily(self) -> float:
        """Convert annual risk-free rate to daily equivalent."""
        return (1 + self.risk_free_rate_annual) ** (1 / 252) - 1


@lru_cache
def get_settings() -> Settings:
    return Settings()
