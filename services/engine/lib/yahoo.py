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

# In-process benchmark cache: {"{symbol}:{period}": (fetched_at, returns_dict)}
# Shared across all concurrent compute requests in the same worker process.
# TTL of 1 hour — benchmark daily returns change at most once per trading day.
_benchmark_cache: dict[str, tuple[float, dict[str, float]]] = {}
_BENCHMARK_TTL_S = 3_600

# Per-key asyncio Lock: prevents a cache stampede where N concurrent requests
# all miss the cache simultaneously and each fires a separate Yahoo Finance fetch.
# Only the first acquires the lock; the rest wait and then read from cache.
_benchmark_locks: dict[str, asyncio.Lock] = {}


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
    Results are cached in-process for 1 hour so that compute/all with 1 000+
    users only hits Yahoo Finance once per worker rather than once per user.
    """
    cache_key = f"{symbol}:{period}"

    # Fast path: cache hit (no lock needed — just read)
    now = time.monotonic()
    cached = _benchmark_cache.get(cache_key)
    if cached is not None:
        fetched_at, cached_returns = cached
        if now - fetched_at < _BENCHMARK_TTL_S:
            return cached_returns

    # Slow path: acquire per-key lock so only ONE coroutine fetches from Yahoo;
    # all others wait then read from the populated cache.
    if cache_key not in _benchmark_locks:
        _benchmark_locks[cache_key] = asyncio.Lock()

    async with _benchmark_locks[cache_key]:
        # Re-check inside lock — another coroutine may have populated while waiting
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

        _benchmark_cache[cache_key] = (time.monotonic(), returns)
        log.info("Benchmark cache populated for %s/%s (%d days)", symbol, period, len(returns))
        return returns
