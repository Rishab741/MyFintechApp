"""
Price data fetching and caching for the comparison engine.

Fetches historical daily OHLCV from Yahoo Finance via yfinance,
writes results to Supabase price_cache, and serves cached data to
the simulation layer.  All functions are async-safe.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf
from supabase import AsyncClient

log = logging.getLogger("engine.prices")

# Minimum date we ever try to fetch — avoids empty requests for pre-digital assets
EARLIEST_FETCH = date(1990, 1, 1)


# ── Public API ────────────────────────────────────────────────────────────────

async def get_prices(
    db: AsyncClient,
    symbol: str,
    start: date,
    end: date,
) -> pd.DataFrame:
    """
    Return a DataFrame with columns [date, adj_close, close, dividend, split_factor]
    for `symbol` between `start` and `end` inclusive.

    1. Checks price_cache in Supabase.
    2. Fetches any missing date ranges from Yahoo Finance.
    3. Writes new rows back to price_cache.
    4. Returns the full requested range from cache.
    """
    cached = await _fetch_from_cache(db, symbol, start, end)
    missing_ranges = _find_missing_ranges(cached, start, end)

    for ms, me in missing_ranges:
        fresh = await _fetch_from_yahoo(symbol, ms, me)
        if not fresh.empty:
            await _write_to_cache(db, symbol, fresh)
            cached = pd.concat([cached, fresh]).drop_duplicates("date").sort_values("date")

    return cached[(cached["date"] >= start) & (cached["date"] <= end)].reset_index(drop=True)


async def get_prices_multi(
    db: AsyncClient,
    symbols: list[str],
    start: date,
    end: date,
) -> dict[str, pd.DataFrame]:
    """Fetch prices for multiple symbols, returned as {symbol: DataFrame}."""
    result: dict[str, pd.DataFrame] = {}
    for symbol in symbols:
        try:
            result[symbol] = await get_prices(db, symbol, start, end)
        except Exception as exc:
            log.warning("get_prices_multi: failed for %s — %s", symbol, exc)
            result[symbol] = pd.DataFrame(columns=["date", "adj_close"])
    return result


async def get_coverage(
    db: AsyncClient,
    symbol: str,
) -> tuple[Optional[date], Optional[date], int]:
    """Return (earliest_date, latest_date, row_count) for a symbol in the cache."""
    resp = await (
        db.table("price_cache")
        .select("date")
        .eq("symbol", symbol)
        .order("date")
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None, None, 0
    dates = [r["date"] for r in rows]
    return date.fromisoformat(dates[0]), date.fromisoformat(dates[-1]), len(dates)


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _fetch_from_cache(
    db: AsyncClient,
    symbol: str,
    start: date,
    end: date,
) -> pd.DataFrame:
    resp = await (
        db.table("price_cache")
        .select("date,open,high,low,close,adj_close,volume,dividend,split_factor")
        .eq("symbol", symbol)
        .gte("date", start.isoformat())
        .lte("date", end.isoformat())
        .order("date")
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close", "adj_close",
                                     "volume", "dividend", "split_factor"])
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"]).dt.date
    for col in ["open", "high", "low", "close", "adj_close", "dividend", "split_factor"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _find_missing_ranges(
    cached: pd.DataFrame,
    start: date,
    end: date,
) -> list[tuple[date, date]]:
    """
    Compare the cached dates against the requested [start, end] window and
    return the minimal list of (range_start, range_end) that need fetching.
    """
    if cached.empty:
        return [(start, end)]

    cached_dates = set(cached["date"])

    # Build the business-day calendar for the range (approximate — Yahoo will
    # return only trading days anyway, so gaps during weekends/holidays are fine)
    cal = pd.bdate_range(start=start, end=end)
    needed = [d.date() for d in cal if d.date() not in cached_dates]

    if not needed:
        return []

    # Coalesce contiguous needed dates into ranges (adding ±1 day buffer so
    # Yahoo returns the boundary rows)
    ranges: list[tuple[date, date]] = []
    range_start = needed[0]
    prev = needed[0]

    for d in needed[1:]:
        if (d - prev).days > 5:      # gap > 1 week → new range
            ranges.append((range_start, prev))
            range_start = d
        prev = d
    ranges.append((range_start, prev))
    return ranges


async def _fetch_from_yahoo(symbol: str, start: date, end: date) -> pd.DataFrame:
    """Download OHLCV from Yahoo Finance.  Returns empty DataFrame on failure."""
    try:
        raw = yf.download(
            symbol,
            start=start.isoformat(),
            end=(end + timedelta(days=1)).isoformat(),  # Yahoo end is exclusive
            auto_adjust=False,
            progress=False,
            threads=False,
        )
        if raw.empty:
            return pd.DataFrame()

        raw = raw.reset_index()
        raw.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in raw.columns]

        df = pd.DataFrame()
        df["date"]         = pd.to_datetime(raw["date"]).dt.date
        df["open"]         = raw.get("open",  pd.Series(dtype=float)).round(8)
        df["high"]         = raw.get("high",  pd.Series(dtype=float)).round(8)
        df["low"]          = raw.get("low",   pd.Series(dtype=float)).round(8)
        df["close"]        = raw.get("close", pd.Series(dtype=float)).round(8)
        df["adj_close"]    = raw.get("adj close", raw.get("close", pd.Series(dtype=float))).round(8)
        df["volume"]       = raw.get("volume", pd.Series(dtype=float)).fillna(0).astype(int)
        df["dividend"]     = raw.get("dividends", pd.Series(dtype=float)).fillna(0).round(8)
        df["split_factor"] = raw.get("stock splits", pd.Series(dtype=float)).fillna(1).replace(0, 1).round(6)

        return df.dropna(subset=["close"]).reset_index(drop=True)

    except Exception as exc:
        log.error("Yahoo Finance fetch failed for %s [%s:%s]: %s", symbol, start, end, exc)
        return pd.DataFrame()


async def _write_to_cache(db: AsyncClient, symbol: str, df: pd.DataFrame) -> None:
    """Upsert rows into price_cache."""
    if df.empty:
        return

    rows = [
        {
            "symbol":       symbol,
            "date":         str(row.date),
            "open":         float(row.open)         if pd.notna(row.open)         else None,
            "high":         float(row.high)         if pd.notna(row.high)         else None,
            "low":          float(row.low)          if pd.notna(row.low)          else None,
            "close":        float(row.close),
            "adj_close":    float(row.adj_close),
            "volume":       int(row.volume)         if pd.notna(row.volume)       else None,
            "dividend":     float(row.dividend)     if pd.notna(row.dividend)     else 0.0,
            "split_factor": float(row.split_factor) if pd.notna(row.split_factor) else 1.0,
            "source":       "yahoo",
        }
        for row in df.itertuples(index=False)
    ]

    try:
        await db.table("price_cache").upsert(rows, on_conflict="symbol,date").execute()
        log.debug("price_cache: upserted %d rows for %s", len(rows), symbol)
    except Exception as exc:
        log.error("price_cache upsert failed for %s: %s", symbol, exc)
