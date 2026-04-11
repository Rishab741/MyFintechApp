"""
Portfolio read endpoints — consumed by the mobile app and web dashboard.

All endpoints require a valid Supabase JWT.
Data is read primarily from performance_cache and portfolio_snapshots_v2
(pre-computed by the /sync/compute endpoint).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from calculations.exposure import build_exposure_report
from calculations.returns import (
    compute_cagr,
    compute_daily_returns,
    compute_period_return,
    compute_twr,
    slice_by_period,
)
from calculations.risk import (
    classify_volatility_regime,
    compute_alpha,
    compute_beta,
    compute_calmar,
    compute_correlation,
    compute_cvar,
    compute_max_drawdown,
    compute_sharpe,
    compute_sortino,
    compute_var,
    compute_volatility,
    compute_win_rate,
)
from config import get_settings
from lib.supabase_client import fetch_holdings, fetch_snapshots, write_audit_log
from lib.yahoo import fetch_benchmark_returns
from middleware.auth import UserContext, require_user
from models.portfolio import (
    ExposureReport,
    NavPoint,
    PerformanceMetrics,
    Period,
    PortfolioHistory,
)

log = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(tags=["portfolio"])


# ── Helper: load + align benchmark returns ────────────────────────────────────
async def _get_benchmark_returns(snapshot_times: list[datetime]) -> list[float]:
    """
    Fetch benchmark daily returns aligned to the portfolio snapshot dates.
    Returns a list of the same length as snapshot_times (minus 1 for daily returns).
    Falls back to zeros if Yahoo Finance is unavailable.
    """
    benchmark_map = await fetch_benchmark_returns(
        symbol=settings.default_benchmark,
        period="2y",
    )
    aligned: list[float] = []
    for i in range(1, len(snapshot_times)):
        date_str = snapshot_times[i].strftime("%Y-%m-%d")
        aligned.append(benchmark_map.get(date_str, 0.0))
    return aligned


# ── GET /portfolio/metrics ────────────────────────────────────────────────────
@router.get("/metrics", response_model=PerformanceMetrics)
async def get_metrics(
    user: Annotated[UserContext, Depends(require_user)],
    period: Period = Query(default="ALL", description="Time window for metrics"),
) -> PerformanceMetrics:
    """
    Return full risk/return metrics for the authenticated user.

    First attempts to serve from the performance_cache (written by /sync/compute).
    If the cache is stale or missing, computes on the fly from portfolio_snapshots_v2.
    """
    # ── Try cache first ───────────────────────────────────────────────────────
    from lib.supabase_client import get_db
    db = get_db()
    cache_res = (
        db.table("performance_cache")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("period", period)
        .limit(1)
        .execute()
    )
    if cache_res.data:
        row = cache_res.data[0]
        # Return cached if computed within the last 6 hours
        computed_at = datetime.fromisoformat(row["computed_at"].replace("Z", "+00:00"))
        age_hours = (datetime.now(tz=timezone.utc) - computed_at).total_seconds() / 3600
        if age_hours < 6:
            return PerformanceMetrics(
                period=period,
                total_return=row.get("total_return") or 0.0,
                twr=row.get("total_return") or 0.0,   # cache stores TWR as total_return
                cagr=row.get("cagr") or 0.0,
                daily_return_avg=row.get("daily_return_avg") or 0.0,
                sharpe_ratio=row.get("sharpe_ratio") or 0.0,
                sortino_ratio=row.get("sortino_ratio") or 0.0,
                calmar_ratio=compute_calmar(
                    row.get("cagr") or 0.0,
                    row.get("max_drawdown") or 0.0,
                ),
                max_drawdown=row.get("max_drawdown") or 0.0,
                drawdown_days=row.get("drawdown_days") or 0,
                volatility=row.get("volatility") or 0.0,
                var_95=row.get("var_95") or 0.0,
                cvar_95=0.0,   # not in cache — will be added in future iteration
                win_rate=row.get("win_rate") or 0.0,
                benchmark_symbol=row.get("benchmark_symbol") or settings.default_benchmark,
                benchmark_return=row.get("benchmark_return") or 0.0,
                alpha=row.get("alpha") or 0.0,
                beta=row.get("beta") or 1.0,
                correlation=0.0,
                total_value=row.get("total_value") or 0.0,
                position_count=row.get("position_count") or 0,
                cash_pct=row.get("cash_pct") or 0.0,
                computed_at=computed_at,
                data_points=0,
            )

    # ── Compute on the fly ────────────────────────────────────────────────────
    return await _compute_metrics_for_user(user.user_id, period)


async def _compute_metrics_for_user(user_id: str, period: Period) -> PerformanceMetrics:
    """Core computation path — called by both the metrics endpoint and /sync/compute."""
    raw_snaps = fetch_snapshots(user_id, limit=500)
    if not raw_snaps:
        raise HTTPException(status_code=404, detail="No portfolio history found.")

    all_values = [float(s["total_value"] or 0) for s in raw_snaps]
    all_times  = [
        datetime.fromisoformat(s["time"].replace("Z", "+00:00"))
        for s in raw_snaps
    ]

    # Slice to requested period
    values, times = slice_by_period(all_values, all_times, period)
    if len(values) < 2:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient data for period '{period}' (need ≥2 snapshots).",
        )

    # Core metrics
    daily_returns = compute_daily_returns(values)
    twr           = compute_twr(values)
    period_return = compute_period_return(values)
    days          = (times[-1] - times[0]).days or 1
    cagr          = compute_cagr(values[0], values[-1], days)

    max_dd, dd_days = compute_max_drawdown(values)

    # Benchmark
    bench_returns  = await _get_benchmark_returns(times)
    bench_total    = sum(bench_returns)   # approximate benchmark total return
    rf_daily       = settings.risk_free_rate_daily

    beta        = compute_beta(daily_returns, bench_returns)
    correlation = compute_correlation(daily_returns, bench_returns)

    # Annualise portfolio and benchmark returns for Jensen's alpha
    portfolio_ann = (1 + twr) ** (365.0 / days) - 1 if days > 0 else 0.0
    benchmark_ann = (1 + bench_total) ** (365.0 / days) - 1 if days > 0 else 0.0
    alpha = compute_alpha(portfolio_ann, benchmark_ann, beta, settings.risk_free_rate_annual)

    # Latest holdings for position count + cash
    holdings      = fetch_holdings(user_id)
    total_value   = values[-1]
    cash_rows = fetch_snapshots(user_id, limit=1)
    cash_value    = float((cash_rows[-1].get("cash_value") or 0)) if cash_rows else 0.0
    cash_pct      = cash_value / total_value if total_value > 0 else 0.0

    return PerformanceMetrics(
        period=period,
        total_return=round(period_return, 6),
        twr=round(twr, 6),
        cagr=round(cagr, 6),
        daily_return_avg=round(sum(daily_returns) / len(daily_returns), 6) if daily_returns else 0.0,
        sharpe_ratio=round(compute_sharpe(daily_returns, rf_daily), 4),
        sortino_ratio=round(compute_sortino(daily_returns, rf_daily), 4),
        calmar_ratio=round(compute_calmar(cagr, max_dd), 4),
        max_drawdown=round(max_dd, 6),
        drawdown_days=dd_days,
        volatility=round(compute_volatility(daily_returns), 6),
        var_95=round(compute_var(daily_returns), 6),
        cvar_95=round(compute_cvar(daily_returns), 6),
        win_rate=round(compute_win_rate(daily_returns), 4),
        benchmark_symbol=settings.default_benchmark,
        benchmark_return=round(bench_total, 6),
        alpha=round(alpha, 6),
        beta=round(beta, 4),
        correlation=round(correlation, 4),
        total_value=round(total_value, 2),
        position_count=len(holdings),
        cash_pct=round(cash_pct, 4),
        computed_at=datetime.now(tz=timezone.utc),
        data_points=len(values),
    )


# ── GET /portfolio/exposure ───────────────────────────────────────────────────
@router.get("/exposure", response_model=ExposureReport)
async def get_exposure(
    user: Annotated[UserContext, Depends(require_user)],
) -> ExposureReport:
    """
    Return portfolio exposure by asset class, sector, and currency,
    plus concentration risk metrics.
    """
    holdings = fetch_holdings(user.user_id)
    if not holdings:
        raise HTTPException(status_code=404, detail="No holdings found.")

    snap = fetch_snapshots(user.user_id, limit=1)
    total_value = float(snap[-1]["total_value"]) if snap else 0.0
    cash_value  = float(snap[-1]["cash_value"])  if snap else 0.0

    report = build_exposure_report(holdings, total_value, cash_value)

    write_audit_log(
        event_type="portfolio.exposure.read",
        actor_id=user.user_id,
        resource="holdings",
    )

    return ExposureReport(**report)


# ── GET /portfolio/history ────────────────────────────────────────────────────
@router.get("/history", response_model=PortfolioHistory)
async def get_history(
    user: Annotated[UserContext, Depends(require_user)],
    period: Period = Query(default="3M"),
) -> PortfolioHistory:
    """
    Return the portfolio NAV time series for charting.
    Includes benchmark-normalised values when available.
    """
    raw_snaps = fetch_snapshots(user.user_id, limit=500)
    if not raw_snaps:
        raise HTTPException(status_code=404, detail="No portfolio history found.")

    all_values = [float(s["total_value"] or 0) for s in raw_snaps]
    all_times  = [
        datetime.fromisoformat(s["time"].replace("Z", "+00:00"))
        for s in raw_snaps
    ]

    values, times = slice_by_period(all_values, all_times, period)

    # Fetch benchmark closes for the same window
    bench_returns = await _get_benchmark_returns(times)

    # Build benchmark normalised series (base 100 at first data point)
    bench_values: list[float | None] = [100.0]
    for r in bench_returns:
        prev = bench_values[-1] or 100.0
        bench_values.append(round(prev * (1 + r), 4))

    nav_series = [
        NavPoint(
            time=times[i],
            total_value=round(values[i], 2),
            cash_value=round(float(raw_snaps[-(len(values) - i)].get("cash_value") or 0), 2),
            invested_value=round(float(raw_snaps[-(len(values) - i)].get("invested_value") or 0), 2),
            daily_return=round(float(raw_snaps[-(len(values) - i)].get("daily_return") or 0), 6)
                if raw_snaps[-(len(values) - i)].get("daily_return") is not None else None,
            benchmark_value=bench_values[i] if i < len(bench_values) else None,
        )
        for i in range(len(values))
    ]

    return PortfolioHistory(
        period=period,
        nav_series=nav_series,
        benchmark_symbol=settings.default_benchmark,
        data_points=len(nav_series),
    )
