"""
Async Redis client singleton.

Used for two shared-state problems that in-process dicts cannot solve
across multiple Uvicorn workers:

  1. Benchmark cache  — lib/yahoo.py writes SPY/benchmark returns here so
                        all workers share one copy, not N separate Yahoo calls/hour.

  2. Rate-limit counters — middleware/rate_limit.py increments per-user daily
                           request counts here so limits aren't silently N×
                           permissive when running multiple workers.

Graceful degradation:
  If REDIS_URL is not set, or the connection fails, every caller receives
  None and falls back to its own in-process state.  The app is fully
  functional in single-worker mode without Redis.

Principle — Fail-once, not retry:
  We check once on the first call and cache the result.  This avoids
  adding Redis latency to every request when the connection is broken.
  A worker restart re-attempts the connection.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)

# Module-level singletons — populated on first call to get_redis().
_redis = None   # redis.asyncio.Redis | None
_ready = False  # True once we have attempted a connection (success or fail)


async def get_redis():
    """
    Return a live Redis client, or None if Redis is unavailable.

    Thread-safe for a single asyncio event loop (one loop per Uvicorn worker).
    Multiple concurrent callers during startup may all attempt connection —
    this is harmless since connect + ping is idempotent.
    """
    global _redis, _ready

    if _ready:
        return _redis

    _ready = True

    try:
        # Lazy import so a missing redis package only errors here, not at startup.
        import redis.asyncio as aioredis  # type: ignore[import]
        from config import get_settings

        url = get_settings().redis_url
        if not url:
            log.info(
                "REDIS_URL is not set — running with in-process caches only. "
                "Set REDIS_URL to enable shared cross-worker state."
            )
            return None

        client: aioredis.Redis = aioredis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=2,   # fail fast on misconfiguration
            socket_timeout=2,
            retry_on_timeout=False,     # one attempt per request; don't stall
        )
        await client.ping()

        _redis = client
        # Mask credentials in log — strip everything before the @ sign.
        safe_url = url.split("@")[-1] if "@" in url else url
        log.info("Redis connected: %s", safe_url)

    except ImportError:
        log.warning(
            "redis package is not installed. "
            "Run: pip install 'redis[hiredis]'"
        )
    except Exception as exc:
        log.warning(
            "Redis unavailable (%s) — falling back to in-process caches. "
            "Restart the worker to retry the connection.",
            exc,
        )

    return _redis
