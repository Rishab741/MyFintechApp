"""
Price data fetching and caching for the comparison engine.

Strategy
--------
1. Check price_cache in Supabase for the requested date range.
2. Collect every symbol that has missing date gaps.
3. Download ALL missing symbols in ONE yfinance call (batch download).
   This is far less likely to trigger rate-limiting than N sequential calls.
4. Retry with exponential back-off on rate-limit responses.
5. Write new rows to price_cache; serve the merged result to callers.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf
from supabase import AsyncClient

log = logging.getLogger("engine.prices")

EARLIEST_FETCH = date(1990, 1, 1)

# Keywords that indicate a Yahoo Finance rate-limit response
_RATE_LIMIT_KEYWORDS = ("rate", "429", "too many", "ratelimit", "limited")


# ── Public API ────────────────────────────────────────────────────────────────

async def get_prices(
    db: AsyncClient,
    symbol: str,
    start: date,
    end: date,
) -> pd.DataFrame:
    """
    Return a DataFrame [date, adj_close, close, dividend, split_factor]
    for a single symbol. Checks cache first, fetches from Yahoo if needed.
    """
    cached = await _fetch_from_cache(db, symbol, start, end)
    missing_ranges = _find_missing_ranges(cached, start, end)

    for ms, me in missing_ranges:
        batch = await _fetch_yahoo_with_retry([symbol], ms, me)
        fresh = batch.get(symbol, pd.DataFrame())
        if not fresh.empty:
            await _write_to_cache(db, symbol, fresh)
            cached = (
                pd.concat([cached, fresh])
                .drop_duplicates("date")
                .sort_values("date")
            )

    return (
        cached[(cached["date"] >= start) & (cached["date"] <= end)]
        .reset_index(drop=True)
    )


async def get_prices_multi(
    db: AsyncClient,
    symbols: list[str],
    start: date,
    end: date,
) -> dict[str, pd.DataFrame]:
    """
    Fetch prices for multiple symbols.

    All symbols with cache misses are downloaded in a SINGLE Yahoo Finance
    request, which is far less likely to trigger per-IP rate limiting than
    N sequential individual requests.
    """
    cached_data: dict[str, pd.DataFrame] = {}
    needs_fetch: list[str] = []

    # Step 1 — check cache for every symbol
    for symbol in symbols:
        try:
            cached = await _fetch_from_cache(db, symbol, start, end)
            if _find_missing_ranges(cached, start, end):
                needs_fetch.append(symbol)
            cached_data[symbol] = cached
        except Exception as exc:
            log.warning("Cache check failed for %s: %s", symbol, exc)
            needs_fetch.append(symbol)
            cached_data[symbol] = pd.DataFrame(columns=["date", "adj_close"])

    # Step 2 — batch-download all stale/missing symbols in one call
    if needs_fetch:
        log.info("Batch-fetching %d symbol(s) from Yahoo Finance: %s", len(needs_fetch), needs_fetch)
        batch = await _fetch_yahoo_with_retry(needs_fetch, start, end)

        for symbol in needs_fetch:
            fresh = batch.get(symbol, pd.DataFrame())
            if fresh.empty:
                log.warning("Yahoo Finance returned no data for %s — skipping", symbol)
                continue

            await _write_to_cache(db, symbol, fresh)

            existing = cached_data.get(symbol, pd.DataFrame())
            merged = (
                pd.concat([existing, fresh]).drop_duplicates("date").sort_values("date")
                if not existing.empty
                else fresh
            )
            cached_data[symbol] = (
                merged[(merged["date"] >= start) & (merged["date"] <= end)]
                .reset_index(drop=True)
            )

    return cached_data


async def get_coverage(
    db: AsyncClient,
    symbol: str,
) -> tuple[Optional[date], Optional[date], int]:
    """Return (earliest_date, latest_date, row_count) for a symbol in cache."""
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
    return date.fromisoformat(dates[0]), date.fromisoformat(dates[-1]), len(rows)


# ── Yahoo Finance — batch download with retry ─────────────────────────────────

async def _fetch_yahoo_with_retry(
    symbols: list[str],
    start: date,
    end: date,
    max_retries: int = 4,
) -> dict[str, pd.DataFrame]:
    """
    Download OHLCV for one or many symbols in a single yfinance call.

    Retries with exponential back-off (2 s → 4 s → 8 s → 16 s) on
    rate-limit errors.  Returns {symbol: DataFrame}; empty DataFrames
    for any symbol that ultimately fails.
    """
    end_exclusive = end + timedelta(days=1)
    # yfinance accepts a single string OR a list; use list even for one symbol
    # so the returned column structure is always consistent.
    ticker_arg = symbols[0] if len(symbols) == 1 else symbols

    for attempt in range(max_retries):
        try:
            raw = yf.download(
                ticker_arg,
                start=start.isoformat(),
                end=end_exclusive.isoformat(),
                auto_adjust=False,
                progress=False,
                threads=len(symbols) > 1,
            )
            if raw.empty:
                log.warning("yfinance returned empty DataFrame for %s", symbols)
                return {s: pd.DataFrame() for s in symbols}

            raw = raw.reset_index()

            if len(symbols) == 1:
                return {symbols[0]: _parse_single(raw)}
            return _parse_batch(raw, symbols)

        except Exception as exc:
            err = str(exc).lower()
            is_rate_limit = any(k in err for k in _RATE_LIMIT_KEYWORDS)
            if is_rate_limit and attempt < max_retries - 1:
                wait_s = min(2 ** (attempt + 1), 30)   # 2 s, 4 s, 8 s, 16 s
                log.warning(
                    "Yahoo Finance rate-limited (attempt %d/%d) — retrying in %ds: %s",
                    attempt + 1, max_retries, wait_s, exc,
                )
                await asyncio.sleep(wait_s)
                continue

            log.error("Yahoo Finance fetch failed for %s: %s", symbols, exc)
            return {s: pd.DataFrame() for s in symbols}

    return {s: pd.DataFrame() for s in symbols}


# ── Column parsers ────────────────────────────────────────────────────────────

def _parse_single(raw: pd.DataFrame) -> pd.DataFrame:
    """Parse yfinance output when a single symbol was requested (flat columns)."""
    raw.columns = [
        c[0].lower() if isinstance(c, tuple) else str(c).lower()
        for c in raw.columns
    ]
    df = pd.DataFrame()
    df["date"]         = pd.to_datetime(raw["date"]).dt.date
    df["open"]         = raw.get("open",   pd.Series(dtype=float)).round(8)
    df["high"]         = raw.get("high",   pd.Series(dtype=float)).round(8)
    df["low"]          = raw.get("low",    pd.Series(dtype=float)).round(8)
    df["close"]        = raw.get("close",  pd.Series(dtype=float)).round(8)
    adj                = raw.get("adj close", raw.get("close", pd.Series(dtype=float)))
    df["adj_close"]    = adj.round(8)
    df["volume"]       = raw.get("volume",       pd.Series(dtype=float)).fillna(0).astype(int)
    df["dividend"]     = raw.get("dividends",    pd.Series(dtype=float)).fillna(0).round(8)
    df["split_factor"] = raw.get("stock splits", pd.Series(dtype=float)).fillna(1).replace(0, 1).round(6)
    return df.dropna(subset=["close"]).reset_index(drop=True)


def _parse_batch(raw: pd.DataFrame, symbols: list[str]) -> dict[str, pd.DataFrame]:
    """
    Parse yfinance multi-symbol output.
    yfinance uses MultiIndex columns: (Metric, Symbol).
    """
    result: dict[str, pd.DataFrame] = {}

    # Locate the Date column (it may be a flat or tuple column)
    date_col = next(
        (c for c in raw.columns
         if (isinstance(c, tuple) and c[0].lower() == "date")
         or (isinstance(c, str) and c.lower() == "date")),
        None,
    )
    if date_col is None:
        log.error("Date column not found in batch yfinance response; columns: %s", raw.columns.tolist())
        return {s: pd.DataFrame() for s in symbols}

    dates = pd.to_datetime(raw[date_col]).dt.date

    for sym in symbols:
        try:
            def _get(metric: str) -> pd.Series:
                """Return the (Metric, Symbol) column, trying common capitalisations."""
                for m in (metric, metric.title(), metric.upper(), metric.lower()):
                    for s in (sym, sym.upper(), sym.lower()):
                        if (m, s) in raw.columns:
                            return raw[(m, s)]
                return pd.Series(dtype=float, index=raw.index)

            close = _get("Close")
            if close.dropna().empty:
                log.warning("No Close data for %s in batch download — skipping", sym)
                result[sym] = pd.DataFrame()
                continue

            adj_close = _get("Adj Close")
            if adj_close.dropna().empty:
                adj_close = close

            result[sym] = pd.DataFrame({
                "date":         dates,
                "open":         _get("Open").round(8),
                "high":         _get("High").round(8),
                "low":          _get("Low").round(8),
                "close":        close.round(8),
                "adj_close":    adj_close.round(8),
                "volume":       _get("Volume").fillna(0).astype(int),
                "dividend":     _get("Dividends").fillna(0).round(8),
                "split_factor": _get("Stock Splits").fillna(1).replace(0, 1).round(6),
            }).dropna(subset=["close"]).reset_index(drop=True)

        except Exception as exc:
            log.warning("Failed to parse batch data for %s: %s", sym, exc)
            result[sym] = pd.DataFrame()

    return result


# ── Cache helpers (unchanged) ─────────────────────────────────────────────────

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
        return pd.DataFrame(columns=[
            "date", "open", "high", "low", "close", "adj_close",
            "volume", "dividend", "split_factor",
        ])
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
    Return the minimal list of (range_start, range_end) spans not in cache.
    Uses the business-day calendar as an approximation; Yahoo returns only
    trading days so weekend/holiday gaps are expected and ignored.
    """
    if cached.empty:
        return [(start, end)]

    cached_dates = set(cached["date"])
    cal = pd.bdate_range(start=start, end=end)
    needed = [d.date() for d in cal if d.date() not in cached_dates]

    if not needed:
        return []

    ranges: list[tuple[date, date]] = []
    range_start = needed[0]
    prev = needed[0]

    for d in needed[1:]:
        if (d - prev).days > 5:
            ranges.append((range_start, prev))
            range_start = d
        prev = d
    ranges.append((range_start, prev))
    return ranges


async def _write_to_cache(db: AsyncClient, symbol: str, df: pd.DataFrame) -> None:
    """Upsert price rows into price_cache."""
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
