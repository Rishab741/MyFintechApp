"""
Yahoo Finance price fetcher.

Mirrors the mobile app's src/market/service.ts but in Python.
Used to:
  1. Fetch the current price for every holding (price sync).
  2. Fetch SPY / benchmark daily closes for beta/alpha calculation.
  3. Fetch historical OHLCV to backfill price_history.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

import httpx

from config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()

BASE1 = "https://query1.finance.yahoo.com"
BASE2 = "https://query2.finance.yahoo.com"

_HEADERS = {
    "User-Agent": settings.yahoo_user_agent,
    "Accept":     "application/json",
}

# Max concurrent v8 chart requests (v7 batch is blocked on server-side)
_CONCURRENT_QUOTES = 20

# ── Benchmark cache ────────────────────────────────────────────────────────────
# Two-tier cache: Redis (shared across all workers) → in-process dict (this worker).
#
# Why two tiers?
#   Redis miss is ~0.5ms; in-process hit is ~0µs.  After the first Redis read
#   we populate the in-process dict so the next 3 599 requests in the same
#   worker don't even touch Redis.
#
# Why Redis at all?
#   Without it, 4 Railway workers each maintain their own dict.  Every hour,
#   all 4 miss their cache simultaneously and fire 4 Yahoo Finance fetches
#   at the same IP.  Yahoo rate-limits by IP, causing empty returns for users
#   whose request hit a worker that got rate-limited.
_BENCHMARK_TTL_S = 3_600
_REDIS_BENCH_NS  = "platstock:bench:"   # Redis key namespace

# In-process layer (per-worker fallback)
_benchmark_cache: dict[str, tuple[float, dict[str, float]]] = {}
_benchmark_locks: dict[str, asyncio.Lock] = {}


async def _redis_bench_get(symbol: str, period: str) -> dict[str, float] | None:
    """Read benchmark returns from Redis. Returns None on miss or error."""
    from lib.redis_client import get_redis
    r = await get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(f"{_REDIS_BENCH_NS}{symbol}:{period}")
        return json.loads(raw) if raw else None
    except Exception as exc:
        log.debug("Redis bench get failed: %s", exc)
        return None


async def _redis_bench_set(symbol: str, period: str, data: dict[str, float]) -> None:
    """Write benchmark returns to Redis. Silently no-ops on error."""
    from lib.redis_client import get_redis
    r = await get_redis()
    if r is None:
        return
    try:
        await r.setex(
            f"{_REDIS_BENCH_NS}{symbol}:{period}",
            _BENCHMARK_TTL_S,
            json.dumps(data),
        )
    except Exception as exc:
        log.debug("Redis bench set failed (non-fatal): %s", exc)


# ── Batch current quotes ──────────────────────────────────────────────────────
async def fetch_quotes(symbols: list[str]) -> dict[str, float]:
    """
    Fetch the latest market price for each symbol via the v8 chart endpoint.

    The v7 batch quote API (query1) is blocked on server-side environments.
    The v8 chart API (query2) is not rate-limited the same way and works
    reliably. We fetch symbols concurrently with a semaphore to stay polite.

    Returns {symbol: price}.  Missing or failed symbols are omitted.
    """
    if not symbols:
        return {}

    clean = list({s.upper().strip() for s in symbols if s})
    results: dict[str, float] = {}
    sem = asyncio.Semaphore(_CONCURRENT_QUOTES)

    async def _fetch_one(client: httpx.AsyncClient, sym: str) -> tuple[str, float | None]:
        url = f"{BASE2}/v8/finance/chart/{sym}?interval=1d&range=1d"
        async with sem:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                meta = data.get("chart", {}).get("result", [{}])[0].get("meta", {})
                price = (
                    meta.get("regularMarketPrice")
                    or meta.get("chartPreviousClose")
                    or meta.get("previousClose")
                )
                return sym, float(price) if price and float(price) > 0 else None
            except Exception as exc:
                log.debug("Yahoo v8 quote failed (%s): %s", sym, exc)
                return sym, None

    async with httpx.AsyncClient(
        headers=_HEADERS,
        timeout=settings.yahoo_timeout_s,
        follow_redirects=True,
    ) as client:
        pairs = await asyncio.gather(*[_fetch_one(client, s) for s in clean])

    for sym, price in pairs:
        if price is not None:
            results[sym] = price

    return results


# ── Historical daily closes ───────────────────────────────────────────────────
async def fetch_daily_closes(
    symbol: str,
    period: str = "1y",
) -> list[dict]:
    """
    Fetch daily adjusted close prices for a symbol.

    Returns list of {time: datetime, close: float, volume: float}.
    `period` must be a valid Yahoo Finance range: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max.
    """
    url = (
        f"{BASE2}/v8/finance/chart/{symbol}"
        f"?interval=1d&range={period}&includeAdjustedClose=true"
    )

    async with httpx.AsyncClient(
        headers=_HEADERS,
        timeout=settings.yahoo_timeout_s,
        follow_redirects=True,
    ) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            log.warning("Yahoo chart fetch failed (%s, %s): %s", symbol, period, exc)
            return []

    result = data.get("chart", {}).get("result", [{}])[0]
    if not result:
        return []

    timestamps: list[int]    = result.get("timestamp", [])
    indicators               = result.get("indicators", {})
    adj_closes: list[float]  = (
        indicators.get("adjclose", [{}])[0].get("adjclose", [])
        or indicators.get("quote", [{}])[0].get("close", [])
    )
    volumes: list[float]     = indicators.get("quote", [{}])[0].get("volume", [])

    rows = []
    for i, ts in enumerate(timestamps):
        close = adj_closes[i] if i < len(adj_closes) else None
        if close is None or close <= 0:
            continue
        rows.append({
            "time":   datetime.fromtimestamp(ts, tz=timezone.utc),
            "close":  round(float(close), 8),
            "volume": float(volumes[i]) if i < len(volumes) else 0.0,
        })

    return rows


# ── Benchmark daily returns ───────────────────────────────────────────────────
async def fetch_benchmark_returns(
    symbol: str = "SPY",
    period: str = "2y",
) -> dict[str, float]:
    """
    Fetch daily percentage returns for the benchmark.
    Returns {date_str: daily_return} e.g. {"2026-01-15": 0.012}.

    Cache resolution order (fastest → slowest):
      1. In-process dict  — zero latency, per-worker, resets on restart.
      2. Redis            — ~0.5ms, shared across all workers, persists across restarts.
      3. Yahoo Finance    — ~500ms network call, populates both caches for next hour.
    """
    cache_key = f"{symbol}:{period}"
    now = time.monotonic()

    # Tier 1: in-process hit (this worker already fetched within the last hour)
    cached = _benchmark_cache.get(cache_key)
    if cached is not None:
        fetched_at, cached_returns = cached
        if now - fetched_at < _BENCHMARK_TTL_S:
            return cached_returns

    # Tier 2: Redis hit (another worker already fetched; share their result)
    redis_data = await _redis_bench_get(symbol, period)
    if redis_data is not None:
        log.debug("Benchmark cache hit (Redis): %s/%s (%d days)", symbol, period, len(redis_data))
        # Warm the in-process cache so subsequent requests skip Redis
        _benchmark_cache[cache_key] = (now, redis_data)
        return redis_data

    # Tier 3: Yahoo Finance — acquire per-key lock so only ONE coroutine fetches;
    # all others wait and read from the freshly-populated in-process cache.
    if cache_key not in _benchmark_locks:
        _benchmark_locks[cache_key] = asyncio.Lock()

    async with _benchmark_locks[cache_key]:
        # Double-check inside the lock — a concurrent coroutine may have
        # fetched from Yahoo while this one was waiting to acquire the lock.
        now = time.monotonic()
        cached = _benchmark_cache.get(cache_key)
        if cached is not None:
            fetched_at, cached_returns = cached
            if now - fetched_at < _BENCHMARK_TTL_S:
                return cached_returns

        closes = await fetch_daily_closes(symbol, period)
        if len(closes) < 2:
            return {}

        returns: dict[str, float] = {}
        for i in range(1, len(closes)):
            prev = closes[i - 1]["close"]
            curr = closes[i]["close"]
            if prev > 0:
                date_str = closes[i]["time"].strftime("%Y-%m-%d")
                returns[date_str] = (curr - prev) / prev

        # Write to both tiers so every worker benefits immediately.
        _benchmark_cache[cache_key] = (time.monotonic(), returns)
        await _redis_bench_set(symbol, period, returns)
        log.info("Benchmark cache populated for %s/%s (%d days)", symbol, period, len(returns))
        return returns
