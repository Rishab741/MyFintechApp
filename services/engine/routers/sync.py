"""
Sync endpoints — called by Supabase Edge Functions and pg_cron, not by clients.

Two operations:
  POST /sync/prices/{user_id}   — fetch latest market prices, write to price_history
  POST /sync/compute/{user_id}  — recompute all performance_cache rows for a user
  POST /sync/compute/all        — recompute for every user (nightly cron)

All endpoints require the ENGINE_SERVICE_KEY, not a user JWT.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from calculations.returns import (
    compute_cagr,
    compute_daily_returns,
    compute_period_return,
    compute_twr,
    slice_by_period,
    PERIOD_DAYS,
)
from calculations.risk import (
    compute_alpha,
    compute_beta,
    compute_calmar,
    compute_max_drawdown,
    compute_sharpe,
    compute_sortino,
    compute_var,
    compute_volatility,
    compute_win_rate,
)
from config import get_settings
from lib.supabase_client import (
    fetch_holdings,
    fetch_snapshots,
    fetch_all_active_symbols,
    fetch_asset_by_symbol,
    update_holding_prices,
    upsert_performance_cache,
    upsert_prices,
    write_audit_log,
    get_db,
)
from lib.yahoo import fetch_benchmark_returns, fetch_quotes, fetch_daily_closes
from middleware.auth import require_service
from models.portfolio import ComputeResult, Period, PriceSyncResult

log = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(tags=["sync"])

ALL_PERIODS: list[Period] = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "ALL"]


# ── POST /sync/prices/{user_id} ───────────────────────────────────────────────
@router.post("/prices/{user_id}", response_model=PriceSyncResult)
async def sync_prices(
    user_id: str,
    _: Annotated[None, Depends(require_service)],
) -> PriceSyncResult:
    """
    1. Fetch the current market price for every symbol in the user's holdings.
    2. Write OHLCV rows to price_history.
    3. Update last_price + open_pnl on each holdings row.
    """
    symbols = fetch_all_active_symbols(user_id)
    if not symbols:
        return PriceSyncResult(
            user_id=user_id,
            symbols_synced=0,
            symbols_failed=0,
            price_rows_written=0,
            holdings_updated=0,
            synced_at=datetime.now(tz=timezone.utc),
        )

    # Fetch current prices from Yahoo Finance
    price_map = await fetch_quotes(symbols)

    symbols_synced  = 0
    symbols_failed  = len(symbols) - len(price_map)
    price_rows: list[dict] = []

    now = datetime.now(tz=timezone.utc)

    for symbol, price in price_map.items():
        asset = fetch_asset_by_symbol(symbol)
        if not asset:
            # Asset not in our catalogue yet — skip price_history write
            # (will be created on the next normaliser run)
            continue

        price_rows.append({
            "time":     now.isoformat(),
            "asset_id": asset["id"],
            "symbol":   symbol,
            "currency": asset.get("currency", "USD"),
            "close":    round(price, 8),
            "source":   "yahoo",
            "adjusted": False,
        })
        symbols_synced += 1

    # Bulk-write to price_history
    if price_rows:
        upsert_prices(price_rows)

    # Update holdings mark-to-market
    update_holding_prices(user_id, price_map)

    write_audit_log(
        event_type="sync.prices",
        actor_id=user_id,
        resource="price_history",
        metadata={"symbols_synced": symbols_synced, "symbols_failed": symbols_failed},
    )

    return PriceSyncResult(
        user_id=user_id,
        symbols_synced=symbols_synced,
        symbols_failed=symbols_failed,
        price_rows_written=len(price_rows),
        holdings_updated=symbols_synced,
        synced_at=now,
    )


# ── POST /sync/compute/all ────────────────────────────────────────────────────
# IMPORTANT: this route must be registered BEFORE /compute/{user_id} so that
# FastAPI does not match the literal string "all" as a path parameter.
@router.post("/compute/all", response_model=dict)
async def compute_all(
    _: Annotated[None, Depends(require_service)],
) -> dict:
    """
    Nightly job: recompute performance_cache for every user that has snapshot data.
    Runs user computations concurrently (with a semaphore to prevent DB overload).
    """
    db = get_db()
    res = (
        db.table("portfolio_snapshots_v2")
        .select("user_id")
        .execute()
    )
    user_ids = list({r["user_id"] for r in (res.data or [])})

    if not user_ids:
        return {"users_computed": 0, "errors": 0}

    semaphore = asyncio.Semaphore(5)   # max 5 concurrent users

    async def bounded_compute(uid: str) -> bool:
        async with semaphore:
            try:
                await _run_compute(uid)
                return True
            except Exception as exc:
                log.warning("compute failed for user %s: %s", uid, exc)
                return False

    results = await asyncio.gather(*[bounded_compute(uid) for uid in user_ids])
    ok    = sum(1 for r in results if r)
    fails = sum(1 for r in results if not r)

    return {
        "users_computed": ok,
        "errors":         fails,
        "computed_at":    datetime.now(tz=timezone.utc).isoformat(),
    }


# ── POST /sync/compute/{user_id} ─────────────────────────────────────────────
@router.post("/compute/{user_id}", response_model=ComputeResult)
async def compute_metrics(
    user_id: str,
    _: Annotated[None, Depends(require_service)],
) -> ComputeResult:
    """
    Recompute all 8 period performance_cache rows for a single user.
    Called after every new portfolio snapshot + nightly by pg_cron.
    """
    computed_periods = await _run_compute(user_id)

    write_audit_log(
        event_type="sync.compute",
        actor_id=user_id,
        resource="performance_cache",
        metadata={"periods": computed_periods},
    )

    return ComputeResult(
        user_id=user_id,
        periods_computed=computed_periods,
        computed_at=datetime.now(tz=timezone.utc),
    )


# ── Core computation logic ────────────────────────────────────────────────────
async def _run_compute(user_id: str) -> list[Period]:
    """
    Compute and upsert performance_cache rows for all 8 periods.
    Returns the list of periods successfully computed.
    """
    raw_snaps = fetch_snapshots(user_id, limit=500)
    if not raw_snaps:
        return []

    all_values = [float(s["total_value"] or 0) for s in raw_snaps]
    all_times  = [
        datetime.fromisoformat(s["time"].replace("Z", "+00:00"))
        for s in raw_snaps
    ]

    # Fetch benchmark for the full available window (once, reuse for all periods)
    bench_map = await fetch_benchmark_returns(
        symbol=settings.default_benchmark,
        period="2y",
    )

    # Current holdings (for position count + cash)
    holdings   = fetch_holdings(user_id)
    snap_last  = raw_snaps[-1]
    total_val  = float(snap_last.get("total_value") or 0)
    cash_val   = float(snap_last.get("cash_value") or 0)
    cash_pct   = cash_val / total_val if total_val > 0 else 0.0

    rf_daily   = settings.risk_free_rate_daily
    rf_annual  = settings.risk_free_rate_annual

    computed: list[Period] = []

    for period in ALL_PERIODS:
        try:
            values, times = slice_by_period(all_values, all_times, period)
            if len(values) < 2:
                continue

            daily_returns = compute_daily_returns(values)
            days          = max((times[-1] - times[0]).days, 1)

            twr           = compute_twr(values)
            period_return = compute_period_return(values)
            cagr          = compute_cagr(values[0], values[-1], days)
            max_dd, dd_days = compute_max_drawdown(values)
            volatility    = compute_volatility(daily_returns)
            sharpe        = compute_sharpe(daily_returns, rf_daily)
            sortino       = compute_sortino(daily_returns, rf_daily)
            var_95        = compute_var(daily_returns)
            win_rate      = compute_win_rate(daily_returns)
            calmar        = compute_calmar(cagr, max_dd)

            # Align benchmark returns to snapshot dates
            bench_aligned = [
                bench_map.get(times[i].strftime("%Y-%m-%d"), 0.0)
                for i in range(1, len(times))
            ]
            bench_total   = sum(bench_aligned)
            beta          = compute_beta(daily_returns, bench_aligned)
            portfolio_ann = (1 + twr) ** (365.0 / days) - 1 if days > 0 else 0.0
            benchmark_ann = (1 + bench_total) ** (365.0 / days) - 1 if days > 0 else 0.0
            alpha         = compute_alpha(portfolio_ann, benchmark_ann, beta, rf_annual)

            upsert_performance_cache(user_id, {
                "period":           period,
                "total_return":     round(twr, 6),
                "cagr":             round(cagr, 6),
                "daily_return_avg": round(sum(daily_returns) / len(daily_returns), 6) if daily_returns else 0.0,
                "sharpe_ratio":     round(sharpe, 4),
                "sortino_ratio":    round(sortino, 4),
                "max_drawdown":     round(max_dd, 6),
                "drawdown_days":    dd_days,
                "volatility":       round(volatility, 6),
                "var_95":           round(var_95, 6),
                "win_rate":         round(win_rate, 4),
                "benchmark_symbol": settings.default_benchmark,
                "benchmark_return": round(bench_total, 6),
                "alpha":            round(alpha, 6),
                "beta":             round(beta, 4),
                "total_value":      round(total_val, 2),
                "position_count":   len(holdings),
                "cash_pct":         round(cash_pct, 4),
            })
            computed.append(period)

        except Exception as exc:
            log.warning("compute failed for user=%s period=%s: %s", user_id, period, exc)
            continue

    return computed
