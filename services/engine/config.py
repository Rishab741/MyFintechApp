from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",   # silently ignore ENGINE_URL and other non-engine vars
    )

    # Defensive: strip a leading UTF-8 BOM (U+FEFF) and surrounding whitespace
    # from every string setting. Copy-pasting a secret from a dashboard, or
    # piping it through certain shells (confirmed on this project: Windows
    # PowerShell -> Vercel CLI silently prepends a BOM), produces a value that
    # looks completely normal in every log and env-var listing, but throws
    # the moment it's used to construct an HTTP header or a Redis URL. Railway
    # env vars are equally exposed to this via dashboard paste or CLI import,
    # so every string field here is sanitised uniformly rather than trusting
    # any one entry point to be byte-perfect.
    @field_validator("*", mode="before")
    @classmethod
    def _strip_bom_and_whitespace(cls, v):
        if isinstance(v, str):
            # Backslash-u-escape (never a literal character) so this fix
            # can't itself fall victim to the encoding bug it guards against.
            return v.replace(chr(0xFEFF), "").strip()
        return v

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

    # ── Redis ─────────────────────────────────────────────────────────────────
    # Optional. When set, enables a shared cross-worker cache for Yahoo Finance
    # benchmark returns and rate-limit counters. Without it the app runs
    # correctly in single-worker mode using in-process dicts.
    # Example: redis://default:password@redis-host:6379/0
    redis_url: str = ""

    # ── Observability ─────────────────────────────────────────────────────────
    sentry_dsn: str = ""   # leave blank to disable Sentry

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
