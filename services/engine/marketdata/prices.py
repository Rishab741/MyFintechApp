"""
Market data enrichment layer (Phase 1, hardened in Phase 10).

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
  - BATCH FETCHING (Phase 10). All symbols go to Yahoo in ONE request —
    a 12-symbol portfolio costs one rate-limit token, not twelve.
  - RETRY WITH BACKOFF (Phase 10). Rate-limited batches retry twice with
    exponential backoff before degrading.
  - TWO-TIER CACHE (Phase 10). In-process TTL dict (per worker) over an
    optional shared Redis layer (cross-worker), matching the engine's
    fail-once Redis pattern in lib/redis_client.py.
"""

from __future__ import annotations

import json
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
_RETRY_DELAYS = (1.5, 4.0)          # seconds between batch attempts

_cache: dict[tuple[str, str], tuple[float, dict[date, float]]] = {}
_cache_lock = threading.Lock()

# ── Sync Redis singleton (fail-once, mirrors lib/redis_client.py) ─────────────
_redis = None
_redis_ready = False
_redis_lock = threading.Lock()


def _get_redis():
    global _redis, _redis_ready
    if _redis_ready:
        return _redis
    with _redis_lock:
        if _redis_ready:
            return _redis
        _redis_ready = True
        try:
            import redis as redis_sync  # type: ignore[import]
            from config import get_settings
            url = get_settings().redis_url
            if not url:
                return None
            client = redis_sync.from_url(
                url, decode_responses=True,
                socket_connect_timeout=2, socket_timeout=2,
            )
            client.ping()
            _redis = client
            log.info("marketdata: Redis price cache enabled")
        except Exception as exc:
            log.warning("marketdata: Redis unavailable (%s) — in-process cache only", exc)
    return _redis


def resolve_symbol(symbol: str, currency: str) -> str:
    """Map a CSV ticker to its Yahoo Finance symbol."""
    s = symbol.upper().strip()
    if currency == "AUD" and not s.endswith(".AX") and not s.startswith("^"):
        return f"{s}.AX"
    return s


# ── Cache helpers ──────────────────────────────────────────────────────────────

def _cache_key(yahoo_symbol: str, start: date) -> tuple[str, str]:
    return (yahoo_symbol, start.strftime("%Y-%m"))


def _redis_key(yahoo_symbol: str, start: date) -> str:
    return f"platstock:px:{yahoo_symbol}:{start.strftime('%Y-%m')}"


def _cache_get(yahoo_symbol: str, start: date) -> dict[date, float] | None:
    now = time.time()
    with _cache_lock:
        hit = _cache.get(_cache_key(yahoo_symbol, start))
        if hit and now - hit[0] < _CACHE_TTL_SECONDS:
            return hit[1]

    r = _get_redis()
    if r is not None:
        try:
            raw = r.get(_redis_key(yahoo_symbol, start))
            if raw:
                series = {date.fromisoformat(k): v for k, v in json.loads(raw).items()}
                with _cache_lock:
                    _cache[_cache_key(yahoo_symbol, start)] = (now, series)
                return series
        except Exception as exc:
            log.warning("marketdata: Redis read failed for %s: %s", yahoo_symbol, exc)
    return None


def _cache_put(yahoo_symbol: str, start: date, series: dict[date, float]) -> None:
    with _cache_lock:
        _cache[_cache_key(yahoo_symbol, start)] = (time.time(), series)
    r = _get_redis()
    if r is not None:
        try:
            payload = json.dumps({d.isoformat(): p for d, p in series.items()})
            r.setex(_redis_key(yahoo_symbol, start), _CACHE_TTL_SECONDS, payload)
        except Exception as exc:
            log.warning("marketdata: Redis write failed for %s: %s", yahoo_symbol, exc)


# ── Batch fetch ────────────────────────────────────────────────────────────────

def _download_batch(yahoo_symbols: list[str], start: date, end: date):
    """One yf.download call for every missing symbol, with retry + backoff."""
    import yfinance as yf
    last_exc: Exception | None = None
    for attempt in range(len(_RETRY_DELAYS) + 1):
        try:
            df = yf.download(
                yahoo_symbols,
                start=start.isoformat(),
                end=(end + timedelta(days=1)).isoformat(),
                progress=False,
                auto_adjust=True,          # splits + dividends folded in
                group_by="column",
                threads=False,             # one HTTP session, predictable rate use
            )
            if df is not None and not df.empty:
                return df
            log.warning("marketdata: empty batch (attempt %d) for %s", attempt + 1, yahoo_symbols)
        except Exception as exc:
            last_exc = exc
            log.warning("marketdata: batch attempt %d failed: %s", attempt + 1, exc)
        if attempt < len(_RETRY_DELAYS):
            time.sleep(_RETRY_DELAYS[attempt])
    if last_exc:
        log.warning("marketdata: batch fetch gave up: %s", last_exc)
    return None


def _series_from_frame(df, yahoo_symbol: str, multi: bool) -> dict[date, float]:
    try:
        closes = df["Close"][yahoo_symbol] if multi else df["Close"]
        if hasattr(closes, "columns"):          # single-ticker frame variant
            closes = closes.iloc[:, 0]
        return {ts.date(): float(v) for ts, v in closes.items() if v == v}
    except Exception:
        return {}


def fetch_series(
    yahoo_symbols: list[str], start: date, end: date,
) -> dict[str, dict[date, float]]:
    """Daily closes per Yahoo symbol. Cache-first; misses fetched in one batch."""
    out: dict[str, dict[date, float]] = {}
    misses: list[str] = []
    for ysym in dict.fromkeys(yahoo_symbols):
        cached = _cache_get(ysym, start)
        if cached is not None:
            out[ysym] = cached
        else:
            misses.append(ysym)

    if misses:
        df = _download_batch(misses, start, end)
        multi = len(misses) > 1
        for ysym in misses:
            series = _series_from_frame(df, ysym, multi) if df is not None else {}
            out[ysym] = series
            if series:                          # never cache an empty failure
                _cache_put(ysym, start, series)
            else:
                log.warning("marketdata: no data for %s", ysym)
    return out


# ── PriceBook ──────────────────────────────────────────────────────────────────

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
    Fetch daily closes for all symbols (+ the currency's benchmark) in a
    single batched request. The book is keyed by the ORIGINAL CSV symbols;
    the benchmark is keyed by its Yahoo symbol. Missing symbols are simply
    absent — callers must check book.has().
    """
    end = end or date.today()
    # Pad the start so the first transaction date always has a prior close.
    fetch_start = start - timedelta(days=14)

    unique = list(dict.fromkeys(symbols))
    yahoo_map = {sym: resolve_symbol(sym, currency) for sym in unique}

    benchmark_symbol: str | None = None
    fetch_list = list(yahoo_map.values())
    if include_benchmark:
        benchmark_symbol = BENCHMARKS.get(currency, BENCHMARKS["USD"])
        if benchmark_symbol not in fetch_list:
            fetch_list.append(benchmark_symbol)

    fetched = fetch_series(fetch_list, fetch_start, end)

    series: dict[str, dict[date, float]] = {
        sym: fetched.get(ysym, {}) for sym, ysym in yahoo_map.items()
    }
    if benchmark_symbol:
        series[benchmark_symbol] = fetched.get(benchmark_symbol, {})
        if not series[benchmark_symbol]:
            benchmark_symbol = None             # benchmark unavailable → degrade

    return PriceBook(series), benchmark_symbol
