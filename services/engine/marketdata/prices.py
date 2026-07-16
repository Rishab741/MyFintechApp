"""
Market data enrichment layer (Phase 1 of the diagnostic engine).

Provides historical daily closes for the symbols in an uploaded CSV plus a
benchmark, so downstream phases (benchmark replay, risk suite, behavioral v2)
have a price surface to compute against.

Design contract:
  - GRACEFUL DEGRADATION. Yahoo being down, a delisted ticker, or a symbol
    that can't be resolved must never fail a diagnostic. Callers receive a
    PriceBook with whatever could be fetched; every consumer handles gaps.
  - ASX RESOLUTION. Australian CSVs carry bare codes (BHP, VAS). When the
    file's currency is AUD, symbols are fetched as "<CODE>.AX" and mapped
    back to the bare code in the returned book.
  - CACHING. In-process TTL cache keyed by (symbol, start-month). A single
    advisor demo session repeatedly diagnosing the same file costs one fetch.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, timedelta

log = logging.getLogger("engine.marketdata")

# Benchmark per currency — investable index proxies, not raw indices, so the
# comparison is something the client could actually have bought.
BENCHMARKS: dict[str, str] = {
    "AUD": "VAS.AX",   # Vanguard Australian Shares (ASX 300)
    "USD": "SPY",      # S&P 500
}

_CACHE_TTL_SECONDS = 6 * 3600
_cache: dict[tuple[str, str], tuple[float, dict[date, float]]] = {}
_cache_lock = threading.Lock()


def resolve_symbol(symbol: str, currency: str) -> str:
    """Map a CSV ticker to its Yahoo Finance symbol."""
    s = symbol.upper().strip()
    if currency == "AUD" and not s.endswith(".AX") and not s.startswith("^"):
        return f"{s}.AX"
    return s


def _fetch_one(yahoo_symbol: str, start: date, end: date) -> dict[date, float]:
    """Fetch one symbol's daily closes. Returns {} on any failure."""
    cache_key = (yahoo_symbol, start.strftime("%Y-%m"))
    now = time.time()

    with _cache_lock:
        hit = _cache.get(cache_key)
        if hit and now - hit[0] < _CACHE_TTL_SECONDS:
            return hit[1]

    try:
        import yfinance as yf
        df = yf.download(
            yahoo_symbol,
            start=start.isoformat(),
            end=(end + timedelta(days=1)).isoformat(),
            progress=False,
            auto_adjust=True,     # adjusted closes: splits + dividends folded in
        )
        if df is None or df.empty:
            log.warning("marketdata: empty response for %s", yahoo_symbol)
            return {}
        closes = df["Close"]
        # yfinance returns a DataFrame column for single tickers on some versions
        if hasattr(closes, "columns"):
            closes = closes.iloc[:, 0]
        series = {
            ts.date(): float(v)
            for ts, v in closes.items()
            if v == v  # drop NaN
        }
    except Exception as exc:
        log.warning("marketdata: fetch failed for %s: %s", yahoo_symbol, exc)
        return {}

    with _cache_lock:
        _cache[cache_key] = (now, series)
    return series


class PriceBook:
    """
    Daily close series for a set of symbols over a window.
    Lookups tolerate non-trading days by walking back up to 7 calendar days.
    """

    def __init__(self, series: dict[str, dict[date, float]]):
        self._series = series

    def has(self, symbol: str) -> bool:
        return bool(self._series.get(symbol))

    def symbols(self) -> list[str]:
        return [s for s, v in self._series.items() if v]

    def price_on(self, symbol: str, d: date) -> float | None:
        """Close on d, or the nearest prior trading day (≤7 days back)."""
        series = self._series.get(symbol)
        if not series:
            return None
        for back in range(8):
            p = series.get(d - timedelta(days=back))
            if p is not None:
                return p
        return None

    def latest(self, symbol: str) -> float | None:
        series = self._series.get(symbol)
        if not series:
            return None
        return series[max(series)]

    def latest_date(self, symbol: str) -> date | None:
        series = self._series.get(symbol)
        return max(series) if series else None

    def series_between(self, symbol: str, start: date, end: date) -> list[tuple[date, float]]:
        series = self._series.get(symbol) or {}
        return sorted((d, p) for d, p in series.items() if start <= d <= end)


def build_price_book(
    symbols: list[str],
    currency: str,
    start: date,
    end: date | None = None,
    include_benchmark: bool = True,
) -> tuple[PriceBook, str | None]:
    """
    Fetch daily closes for all symbols (+ the currency's benchmark).

    Returns (book, benchmark_symbol). The book is keyed by the ORIGINAL CSV
    symbols; the benchmark is keyed by its Yahoo symbol. Missing symbols are
    simply absent — callers must check book.has().
    """
    end = end or date.today()
    # Pad the start so the first transaction date always has a prior close.
    fetch_start = start - timedelta(days=14)

    series: dict[str, dict[date, float]] = {}
    for sym in dict.fromkeys(symbols):          # de-dupe, preserve order
        series[sym] = _fetch_one(resolve_symbol(sym, currency), fetch_start, end)

    benchmark_symbol: str | None = None
    if include_benchmark:
        benchmark_symbol = BENCHMARKS.get(currency, BENCHMARKS["USD"])
        series[benchmark_symbol] = _fetch_one(benchmark_symbol, fetch_start, end)
        if not series[benchmark_symbol]:
            benchmark_symbol = None             # benchmark unavailable → degrade

    return PriceBook(series), benchmark_symbol
