"""
Per-tenant rate limiting middleware.

Limits are enforced in-memory (resets on process restart / redeploy).
This is intentional — it's simple, adds zero latency, and is sufficient
for a single-process Railway deployment. Promote to Redis when horizontally
scaling.

Tier daily limits:
    self_serve    →    500 req/day
    starter       →  5,000 req/day
    professional  → 50,000 req/day
    enterprise    →  unlimited
"""

from __future__ import annotations

import hashlib
import logging
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import JWTError, jwt

log = logging.getLogger(__name__)

TIER_DAILY_LIMITS: dict[str, int] = {
    "self_serve":   500,
    "starter":      5_000,
    "professional": 50_000,
    "enterprise":   -1,      # -1 == unlimited
}

# {rate_limit_key: (count, utc_day_start_epoch)}
_counters: dict[str, tuple[int, float]] = {}

# Cache API key → (tenant_id, tier) to avoid a DB lookup on every request.
_api_key_tier_cache: dict[str, tuple[str, str]] = {}


def _utc_day_start() -> float:
    now = time.time()
    return now - (now % 86400)


def _enforce(key: str, tier: str) -> None:
    limit = TIER_DAILY_LIMITS.get(tier, 500)
    if limit == -1:
        return

    day_start = _utc_day_start()
    count, window = _counters.get(key, (0, day_start))

    if window < day_start:
        count, window = 0, day_start   # new UTC day — reset

    if count >= limit:
        retry_after = int(day_start + 86400 - time.time())
        raise _LimitExceeded(tier, limit, retry_after)

    _counters[key] = (count + 1, window)


class _LimitExceeded(Exception):
    def __init__(self, tier: str, limit: int, retry_after: int):
        self.tier = tier
        self.limit = limit
        self.retry_after = retry_after


def _resolve(token: str, settings) -> tuple[str | None, str]:
    """
    Return (rate_limit_key, tier) for the token.

    For JWT users  → key = user_id (sub claim), tier = self_serve
    For API clients → key = tenant_id, tier = actual tenant tier
    Returns (None, 'self_serve') if unresolvable (fail open).
    """
    # ── JWT path ──────────────────────────────────────────────────────────────
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user_id = payload.get("sub")
        if user_id:
            return user_id, "self_serve"
    except JWTError:
        pass

    # ── API key path ──────────────────────────────────────────────────────────
    key_hash = hashlib.sha256(token.encode()).hexdigest()

    if key_hash in _api_key_tier_cache:
        return _api_key_tier_cache[key_hash]

    try:
        from lib.supabase_client import get_db
        res = (
            get_db()
            .table("tenants")
            .select("id, tier")
            .eq("api_key_hash", key_hash)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if res.data:
            tenant = res.data[0]
            entry = (tenant["id"], tenant.get("tier", "self_serve"))
            _api_key_tier_cache[key_hash] = entry
            return entry
    except Exception as exc:
        log.debug("rate_limit: api key tier lookup failed: %s", exc)

    return None, "self_serve"


async def rate_limit_middleware(request: Request, call_next):
    """FastAPI middleware — add via app.middleware('http')."""
    if not request.url.path.startswith("/v1/"):
        return await call_next(request)

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return await call_next(request)

    token = auth[7:]

    try:
        from config import get_settings
        settings = get_settings()

        # Internal service key calls are never rate-limited.
        if token == settings.engine_service_key:
            return await call_next(request)

        rate_key, tier = _resolve(token, settings)
        if rate_key:
            _enforce(rate_key, tier)

    except _LimitExceeded as exc:
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limit_exceeded",
                "detail": (
                    f"Tier '{exc.tier}' allows {exc.limit:,} requests/day. "
                    "Upgrade your plan at vestara.io/pricing."
                ),
            },
            headers={"Retry-After": str(exc.retry_after)},
        )
    except Exception as exc:
        # Never block a legitimate request because of a rate-limit bug.
        log.warning("rate_limit: unexpected error (fail open): %s", exc)

    return await call_next(request)
