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

# Max symbols per batch quote request (Yahoo limit is ~500 but we stay safe)
_BATCH_SIZE = 50


# ── Batch current quotes ──────────────────────────────────────────────────────
async def fetch_quotes(symbols: list[str]) -> dict[str, float]:
    """
    Fetch the latest market price for each symbol.
    Returns {symbol: price}.  Missing or failed symbols are omitted.
    """
    if not symbols:
        return {}

    # De-duplicate and clean
    clean = list({s.upper().strip() for s in symbols if s})

    results: dict[str, float] = {}

    async with httpx.AsyncClient(
        headers=_HEADERS,
        timeout=settings.yahoo_timeout_s,
        follow_redirects=True,
    ) as client:
        for batch_start in range(0, len(clean), _BATCH_SIZE):
            batch = clean[batch_start : batch_start + _BATCH_SIZE]
            encoded = ",".join(batch)
            url = (
                f"{BASE1}/v7/finance/quote"
                f"?symbols={encoded}"
                f"&fields=regularMarketPrice,regularMarketPreviousClose"
            )
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                for item in data.get("quoteResponse", {}).get("result", []):
                    sym   = item.get("symbol", "")
                    price = item.get("regularMarketPrice") or item.get("regularMarketPreviousClose")
                    if sym and price and price > 0:
                        results[sym.upper()] = float(price)
            except Exception as exc:
                log.warning("Yahoo batch quote failed (symbols=%s): %s", batch, exc)
                # Continue with next batch rather than failing entire request
                await asyncio.sleep(0.2)

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
    """
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

    return returns
