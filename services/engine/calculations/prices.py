"""
Price data fetching and caching for the comparison engine.

Strategy
--------
1. Check price_cache in Supabase for the requested date range.
2. Collect every symbol that has missing date gaps.
3. Download ALL missing symbols concurrently via Yahoo Finance v8 chart API.
   This API is unblocked on server environments (v7 batch is rate-limited).
4. Retry with exponential back-off on 429 responses.
5. Write new rows to price_cache; serve the merged result to callers.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx
import pandas as pd
from supabase import AsyncClient

from config import get_settings

log = logging.getLogger("engine.prices")
settings = get_settings()

EARLIEST_FETCH = date(1990, 1, 1)

BASE2 = "https://query2.finance.yahoo.com"

_HEADERS = {
    "User-Agent": settings.yahoo_user_agent,
    "Accept":     "application/json",
}

# Max concurrent v8 chart requests
_CONCURRENT = 8


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

    All symbols with cache misses are downloaded concurrently via the Yahoo
    Finance v8 chart API — bypasses the per-IP rate limit that blocks the
    legacy v7 batch endpoint on server environments.
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

    # Step 2 — concurrently fetch all stale/missing symbols
    if needs_fetch:
        log.info("Fetching %d symbol(s) from Yahoo Finance v8: %s", len(needs_fetch), needs_fetch)
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


# ── Yahoo Finance v8 — concurrent fetch with retry ────────────────────────────

def _to_unix(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


async def _fetch_yahoo_with_retry(
    symbols: list[str],
    start: date,
    end: date,
    max_retries: int = 4,
) -> dict[str, pd.DataFrame]:
    """
    Fetch OHLCV + dividends + splits for one or many symbols via the
    Yahoo Finance v8/finance/chart API.

    Each symbol is fetched in its own HTTP request, all fired concurrently
    (up to _CONCURRENT in-flight at once).  Retries with exponential
    back-off (2s → 4s → 8s → 16s) on 429 or transient errors.

    Returns {symbol: DataFrame}; empty DataFrames for any symbol that fails.
    """
    period1 = _to_unix(start)
    period2 = _to_unix(end + timedelta(days=1))   # Yahoo end is exclusive

    sem = asyncio.Semaphore(_CONCURRENT)

    async def _fetch_one(
        client: httpx.AsyncClient,
        sym: str,
    ) -> tuple[str, pd.DataFrame]:
        url = (
            f"{BASE2}/v8/finance/chart/{sym}"
            f"?interval=1d&period1={period1}&period2={period2}"
            f"&includeAdjustedClose=true&events=div,splits"
        )
        for attempt in range(max_retries):
            try:
                async with sem:
                    resp = await client.get(url)
            except Exception as exc:
                log.warning("Yahoo v8 request error (%s, attempt %d): %s", sym, attempt + 1, exc)
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return sym, pd.DataFrame()

            if resp.status_code == 429:
                wait_s = min(2 ** (attempt + 1), 30)
                log.warning(
                    "Yahoo v8 rate-limited (%s, attempt %d/%d) — retrying in %ds",
                    sym, attempt + 1, max_retries, wait_s,
                )
                if attempt < max_retries - 1:
                    await asyncio.sleep(wait_s)
                    continue
                return sym, pd.DataFrame()

            try:
                resp.raise_for_status()
                return sym, _parse_v8_response(resp.json(), sym)
            except Exception as exc:
                log.error("Yahoo v8 parse failed (%s, attempt %d): %s", sym, attempt + 1, exc)
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return sym, pd.DataFrame()

        return sym, pd.DataFrame()

    async with httpx.AsyncClient(
        headers=_HEADERS,
        timeout=settings.yahoo_timeout_s,
        follow_redirects=True,
    ) as client:
        pairs = await asyncio.gather(*[_fetch_one(client, s) for s in symbols])

    return dict(pairs)


def _parse_v8_response(data: dict, symbol: str) -> pd.DataFrame:
    """
    Parse a Yahoo Finance v8/finance/chart API JSON response into a
    standardised price DataFrame.

    Columns: date, open, high, low, close, adj_close, volume, dividend, split_factor
    """
    chart = data.get("chart", {})
    results = chart.get("result") or []
    if not results:
        log.warning("Yahoo v8 empty result for %s", symbol)
        return pd.DataFrame()

    result      = results[0]
    timestamps  = result.get("timestamp") or []
    if not timestamps:
        return pd.DataFrame()

    indicators  = result.get("indicators", {})
    quote       = (indicators.get("quote") or [{}])[0]
    adjclose_block = (indicators.get("adjclose") or [{}])[0]

    opens      = quote.get("open",   [])
    highs      = quote.get("high",   [])
    lows       = quote.get("low",    [])
    closes     = quote.get("close",  [])
    volumes    = quote.get("volume", [])
    adj_closes = adjclose_block.get("adjclose") or closes

    # Build dividend/split lookup keyed by ISO date string
    events    = result.get("events", {})
    dividends: dict[str, float] = {}
    splits:    dict[str, float] = {}

    for ts_str, div_ev in (events.get("dividends") or {}).items():
        d = datetime.fromtimestamp(int(ts_str), tz=timezone.utc).date()
        dividends[str(d)] = float(div_ev.get("amount", 0.0))

    for ts_str, spl_ev in (events.get("splits") or {}).items():
        d = datetime.fromtimestamp(int(ts_str), tz=timezone.utc).date()
        num = float(spl_ev.get("numerator", 1.0))
        den = float(spl_ev.get("denominator", 1.0))
        splits[str(d)] = (num / den) if den else 1.0

    rows = []
    for i, ts in enumerate(timestamps):
        close = closes[i] if i < len(closes) else None
        if close is None or close <= 0:
            continue
        d        = datetime.fromtimestamp(ts, tz=timezone.utc).date()
        date_str = str(d)
        adj      = adj_closes[i] if i < len(adj_closes) and adj_closes[i] else close

        rows.append({
            "date":         d,
            "open":         round(float(opens[i]),   8) if i < len(opens)   and opens[i]   is not None else None,
            "high":         round(float(highs[i]),   8) if i < len(highs)   and highs[i]   is not None else None,
            "low":          round(float(lows[i]),    8) if i < len(lows)    and lows[i]    is not None else None,
            "close":        round(float(close),      8),
            "adj_close":    round(float(adj),        8),
            "volume":       int(volumes[i]) if i < len(volumes) and volumes[i] is not None else 0,
            "dividend":     round(dividends.get(date_str, 0.0), 8),
            "split_factor": round(splits.get(date_str, 1.0),    6),
        })

    if not rows:
        return pd.DataFrame()

    return pd.DataFrame(rows).dropna(subset=["close"]).reset_index(drop=True)


# ── Cache helpers ─────────────────────────────────────────────────────────────

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
