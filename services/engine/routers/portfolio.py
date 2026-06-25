"""
Portfolio read endpoints — consumed by the mobile app and web dashboard.

All endpoints require a valid Supabase JWT.
Data is read primarily from performance_cache and portfolio_snapshots_v2
(pre-computed by the /sync/compute endpoint).
"""

from __future__ import annotations

import asyncio
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
from lib.supabase_client import (
    fetch_all_active_symbols,
    fetch_asset_by_symbol,
    fetch_holdings,
    fetch_snapshots,
    update_holding_prices,
    upsert_prices,
    write_audit_log,
    get_db,
)
from lib.yahoo import fetch_benchmark_returns, fetch_daily_closes, fetch_quotes
from middleware.auth import UserContext, require_user
from models.portfolio import (
    ExposureReport,
    HealthScoreBreakdown,
    HealthScoreResponse,
    NavPoint,
    PerformanceMetrics,
    Period,
    PipelineStatus,
    PortfolioHistory,
    RefreshResult,
    WhatIfRequest,
    WhatIfResponse,
    WhatIfTimePoint,
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
    # Fetch snapshots + holdings in parallel to halve Supabase round-trips
    raw_snaps, holdings = await asyncio.gather(
        asyncio.to_thread(fetch_snapshots, user_id, 500),
        asyncio.to_thread(fetch_holdings, user_id),
    )

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

    # Benchmark fetch is async + cached — concurrent with metric computation above
    bench_returns  = await _get_benchmark_returns(times)
    bench_total    = sum(bench_returns)
    rf_daily       = settings.risk_free_rate_daily

    beta        = compute_beta(daily_returns, bench_returns)
    correlation = compute_correlation(daily_returns, bench_returns)

    # Annualise both series for Jensen's alpha
    portfolio_ann = (1 + twr) ** (365.0 / days) - 1 if days > 0 else 0.0
    benchmark_ann = (1 + bench_total) ** (365.0 / days) - 1 if days > 0 else 0.0
    alpha = compute_alpha(portfolio_ann, benchmark_ann, beta, settings.risk_free_rate_annual)

    total_value = values[-1]
    # cash_value available from the most recent snapshot directly
    cash_rows = raw_snaps[-1:]
    cash_value    = float((cash_rows[-1].get("cash_value") or 0)) if cash_rows else 0.0
    cash_pct      = cash_value / total_value if total_value > 0 else 0.0

    # Data freshness — stale when most recent snapshot is >24h old
    latest_time       = times[-1]
    snapshot_age_h    = (datetime.now(tz=timezone.utc) - latest_time).total_seconds() / 3600
    is_stale          = snapshot_age_h > 24.0

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
        benchmark_return=round(benchmark_ann, 6),
        alpha=round(alpha, 6),
        beta=round(beta, 4),
        correlation=round(correlation, 4),
        total_value=round(total_value, 2),
        position_count=len(holdings),
        cash_pct=round(cash_pct, 4),
        computed_at=datetime.now(tz=timezone.utc),
        data_points=len(values),
        snapshot_age_hours=round(snapshot_age_h, 2),
        is_data_stale=is_stale,
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
    # Fetch holdings and latest snapshot in parallel
    holdings, snap = await asyncio.gather(
        asyncio.to_thread(fetch_holdings, user.user_id),
        asyncio.to_thread(fetch_snapshots, user.user_id, 1),
    )
    if not holdings:
        raise HTTPException(status_code=404, detail="No holdings found.")

    total_value = float(snap[-1]["total_value"]) if snap else 0.0
    cash_value  = float(snap[-1]["cash_value"])  if snap else 0.0

    report = build_exposure_report(holdings, total_value, cash_value)

    # Fire audit log in background — don't block the response
    asyncio.create_task(asyncio.to_thread(
        write_audit_log,
        event_type="portfolio.exposure.read",
        actor_id=user.user_id,
        resource="holdings",
    ))

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
    raw_snaps = await asyncio.to_thread(fetch_snapshots, user.user_id, 500)
    if not raw_snaps:
        raise HTTPException(status_code=404, detail="No portfolio history found.")

    all_values = [float(s["total_value"] or 0) for s in raw_snaps]
    all_times  = [
        datetime.fromisoformat(s["time"].replace("Z", "+00:00"))
        for s in raw_snaps
    ]

    values, times = slice_by_period(all_values, all_times, period)

    # Benchmark fetch hits cache (or Yahoo Finance once, then cache for 1h)
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


# ── GET /portfolio/health-score ───────────────────────────────────────────────
@router.get("/health-score", response_model=HealthScoreResponse)
async def get_health_score(
    user: Annotated[UserContext, Depends(require_user)],
) -> HealthScoreResponse:
    """
    Return a 0-100 composite portfolio health score with sub-scores and insights.
    Uses ALL-period metrics for the score (broadest available window).
    """
    raw_snaps = fetch_snapshots(user.user_id, limit=500)
    if not raw_snaps:
        raise HTTPException(status_code=404, detail="No portfolio history found.")

    all_values = [float(s["total_value"] or 0) for s in raw_snaps]
    all_times  = [
        datetime.fromisoformat(s["time"].replace("Z", "+00:00"))
        for s in raw_snaps
    ]

    daily_returns = compute_daily_returns(all_values)
    max_dd, _     = compute_max_drawdown(all_values)
    sharpe        = compute_sharpe(daily_returns, settings.risk_free_rate_daily)
    win_rate      = compute_win_rate(daily_returns)

    holdings  = fetch_holdings(user.user_id)
    snap_last = raw_snaps[-1]
    total_val = float(snap_last.get("total_value") or 0)
    cash_val  = float(snap_last.get("cash_value") or 0)
    cash_pct  = cash_val / total_val if total_val > 0 else 0.0

    from calculations.exposure import compute_concentration_risk
    concentration = compute_concentration_risk(holdings, total_val)
    effective_n   = float(concentration.get("effective_n", 1))

    # ── Sub-scores ────────────────────────────────────────────────────────────
    s_diversification = min(30.0, effective_n / 10.0 * 30.0)
    s_risk_return     = max(0.0, min(25.0, sharpe / 1.5 * 25.0))
    s_drawdown        = max(0.0, min(25.0, (1.0 - abs(max_dd) / 0.5) * 25.0))
    s_consistency     = max(0.0, min(10.0, (win_rate - 0.40) * 50.0))
    s_cash_eff        = max(0.0, min(10.0, (1.0 - cash_pct / 0.30) * 10.0))

    total_score = int(round(s_diversification + s_risk_return + s_drawdown + s_consistency + s_cash_eff))

    grade = (
        "A" if total_score >= 80 else
        "B" if total_score >= 65 else
        "C" if total_score >= 50 else
        "D" if total_score >= 35 else
        "F"
    )

    # ── Insights ──────────────────────────────────────────────────────────────
    insights: list[str] = []
    if effective_n < 5:
        insights.append(
            f"Your portfolio has low diversification (effective N = {effective_n:.1f}). "
            "Adding uncorrelated positions reduces concentration risk."
        )
    if sharpe < 0.5:
        insights.append(
            f"Your Sharpe ratio of {sharpe:.2f} suggests returns aren't adequately "
            "compensating for volatility. A target above 1.0 is considered healthy."
        )
    if abs(max_dd) > 0.25:
        insights.append(
            f"A max drawdown of {max_dd * 100:.1f}% is significant. "
            "Broader diversification or defensive assets can cushion future drops."
        )
    if cash_pct > 0.20:
        insights.append(
            f"{cash_pct * 100:.0f}% cash is creating a drag on returns. "
            "Consider deploying idle cash toward your target allocation."
        )
    if win_rate > 0.55 and len(insights) < 3:
        insights.append(
            f"Strong daily win rate ({win_rate * 100:.0f}%) reflects consistent positive momentum."
        )
    if not insights:
        insights.append(
            "Your portfolio is well-balanced across diversification, risk, and consistency."
        )

    write_audit_log(
        event_type="portfolio.health_score.read",
        actor_id=user.user_id,
        resource="portfolio_snapshots_v2",
    )

    return HealthScoreResponse(
        score=total_score,
        grade=grade,
        breakdown=HealthScoreBreakdown(
            diversification=round(s_diversification, 2),
            risk_return=round(s_risk_return, 2),
            drawdown_resilience=round(s_drawdown, 2),
            consistency=round(s_consistency, 2),
            cash_efficiency=round(s_cash_eff, 2),
        ),
        insights=insights[:3],
        computed_at=datetime.now(tz=timezone.utc),
    )


# ── POST /portfolio/what-if ───────────────────────────────────────────────────
@router.post("/what-if", response_model=WhatIfResponse)
async def what_if(
    body: WhatIfRequest,
    user: Annotated[UserContext, Depends(require_user)],
) -> WhatIfResponse:
    """
    Compare a hypothetical single-ticker investment vs the user's actual portfolio
    and SPY, all starting from start_date with the same dollar amount.
    """
    from datetime import date as date_type

    try:
        start_dt = datetime.strptime(body.start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=422, detail="start_date must be YYYY-MM-DD")

    now = datetime.now(tz=timezone.utc)
    if start_dt >= now:
        raise HTTPException(status_code=422, detail="start_date must be in the past")

    symbol = body.symbol.upper().strip()

    # ── Fetch historical closes for the ticker + SPY ──────────────────────────
    hyp_closes, spy_closes = await asyncio.gather(
        fetch_daily_closes(symbol, period="5y"),
        fetch_daily_closes("SPY", period="5y"),
    )

    # Filter both to [start_date, today]
    hyp_filtered = [c for c in hyp_closes if c["time"] >= start_dt]
    spy_filtered  = [c for c in spy_closes  if c["time"] >= start_dt]

    if len(hyp_filtered) < 2:
        raise HTTPException(
            status_code=422,
            detail=f"No price data for {symbol} from {body.start_date}. "
                   "Try a later start date or check the ticker symbol."
        )

    hyp_start  = hyp_filtered[0]["close"]
    hyp_end    = hyp_filtered[-1]["close"]
    hyp_return = (hyp_end - hyp_start) / hyp_start
    hyp_final  = round(body.amount * (1 + hyp_return), 2)
    hyp_days   = max((hyp_filtered[-1]["time"] - hyp_filtered[0]["time"]).days, 1)
    hyp_cagr   = compute_cagr(hyp_start, hyp_end, hyp_days)

    spy_start  = spy_filtered[0]["close"] if spy_filtered else hyp_start
    spy_end    = spy_filtered[-1]["close"] if spy_filtered else hyp_start
    spy_return = (spy_end - spy_start) / spy_start if spy_start else 0.0
    spy_cagr   = compute_cagr(spy_start, spy_end, hyp_days) if spy_filtered else 0.0

    # ── Actual portfolio performance for the same window ─────────────────────
    raw_snaps = fetch_snapshots(user.user_id, limit=500)
    actual_return = 0.0
    actual_cagr   = 0.0
    port_series: dict[str, float] = {}   # date → normalised value

    if raw_snaps:
        all_values = [float(s["total_value"] or 0) for s in raw_snaps]
        all_times  = [
            datetime.fromisoformat(s["time"].replace("Z", "+00:00"))
            for s in raw_snaps
        ]
        port_slice_vals, port_slice_times = slice_by_period(
            all_values, all_times, "ALL"
        )
        # Further filter to start_date
        filtered_pairs = [
            (v, t) for v, t in zip(port_slice_vals, port_slice_times)
            if t >= start_dt
        ]
        if len(filtered_pairs) >= 2:
            p_vals = [p[0] for p in filtered_pairs]
            p_times = [p[1] for p in filtered_pairs]
            actual_return = compute_twr(p_vals)
            port_days     = max((p_times[-1] - p_times[0]).days, 1)
            actual_cagr   = compute_cagr(p_vals[0], p_vals[-1], port_days)
            p_base        = p_vals[0]
            for v, t in zip(p_vals, p_times):
                port_series[t.strftime("%Y-%m-%d")] = round(body.amount * v / p_base, 2)

    # ── Build normalised time series ──────────────────────────────────────────
    hyp_base  = hyp_filtered[0]["close"]
    spy_base  = spy_filtered[0]["close"] if spy_filtered else None
    spy_map   = {c["time"].strftime("%Y-%m-%d"): c["close"] for c in spy_filtered}
    time_series: list[WhatIfTimePoint] = []

    for c in hyp_filtered:
        d = c["time"].strftime("%Y-%m-%d")
        hyp_val  = round(body.amount * c["close"] / hyp_base, 2)
        port_val = port_series.get(d, 0.0)
        spy_val  = round(body.amount * spy_map[d] / spy_base, 2) if (spy_base and d in spy_map) else 0.0
        time_series.append(WhatIfTimePoint(date=d, hypothetical=hyp_val, portfolio=port_val, benchmark=spy_val))

    # ── Determine winner ──────────────────────────────────────────────────────
    returns = {
        "hypothetical": hyp_return,
        "portfolio":    actual_return,
        "benchmark":    spy_return,
    }
    winner = max(returns, key=lambda k: returns[k])

    write_audit_log(
        event_type="portfolio.what_if.run",
        actor_id=user.user_id,
        resource="price_history",
        metadata={"symbol": symbol, "start_date": body.start_date, "amount": body.amount},
    )

    return WhatIfResponse(
        symbol=symbol,
        amount_invested=body.amount,
        start_date=body.start_date,
        end_date=now.strftime("%Y-%m-%d"),
        hypothetical_final=hyp_final,
        hypothetical_return=round(hyp_return, 6),
        hypothetical_cagr=round(hyp_cagr, 6),
        actual_return=round(actual_return, 6),
        actual_cagr=round(actual_cagr, 6),
        benchmark_return=round(spy_return, 6),
        benchmark_cagr=round(spy_cagr, 6),
        winner=winner,
        time_series=time_series,
    )


# ── GET /portfolio/status ─────────────────────────────────────────────────────
@router.get("/status", response_model=PipelineStatus)
async def pipeline_status(
    user: Annotated[UserContext, Depends(require_user)],
) -> PipelineStatus:
    """Return counts the pipeline UI needs to show current data state."""
    db = get_db()

    snap_res = (
        db.table("portfolio_snapshots_v2")
        .select("time", count="exact")
        .eq("user_id", user.user_id)
        .execute()
    )
    snapshot_count = snap_res.count or 0

    hold_res = (
        db.table("holdings")
        .select("id", count="exact")
        .eq("user_id", user.user_id)
        .gt("quantity", 0)
        .execute()
    )
    holdings_count = hold_res.count or 0

    cache_res = (
        db.table("performance_cache")
        .select("computed_at")
        .eq("user_id", user.user_id)
        .order("computed_at", desc=True)
        .limit(1)
        .execute()
    )
    last_computed = None
    if cache_res.data:
        last_computed = datetime.fromisoformat(
            cache_res.data[0]["computed_at"].replace("Z", "+00:00")
        )

    hold_price_res = (
        db.table("holdings")
        .select("last_price_at")
        .eq("user_id", user.user_id)
        .gt("quantity", 0)
        .order("last_price_at", desc=True)
        .limit(1)
        .execute()
    )
    last_synced = None
    if hold_price_res.data and hold_price_res.data[0].get("last_price_at"):
        last_synced = datetime.fromisoformat(
            hold_price_res.data[0]["last_price_at"].replace("Z", "+00:00")
        )

    return PipelineStatus(
        snapshot_count=snapshot_count,
        holdings_count=holdings_count,
        last_computed_at=last_computed,
        last_synced_at=last_synced,
    )


# ── POST /portfolio/refresh ───────────────────────────────────────────────────
@router.post("/refresh", response_model=RefreshResult)
async def refresh_portfolio(
    user: Annotated[UserContext, Depends(require_user)],
) -> RefreshResult:
    """
    User-triggered sync + compute.
    Fetches live prices for all holdings, then recomputes all 8 period metrics.
    Equivalent to calling /sync/prices + /sync/compute with the service key.
    """
    from routers.sync import _run_compute

    now     = datetime.now(tz=timezone.utc)
    synced  = 0
    failed  = 0

    symbols = fetch_all_active_symbols(user.user_id)
    if symbols:
        price_map = await fetch_quotes(symbols)
        failed    = len(symbols) - len(price_map)

        price_rows: list[dict] = []
        for symbol, price in price_map.items():
            asset = fetch_asset_by_symbol(symbol)
            if asset:
                price_rows.append({
                    "time":     now.isoformat(),
                    "asset_id": asset["id"],
                    "symbol":   symbol,
                    "currency": asset.get("currency", "USD"),
                    "close":    round(price, 8),
                    "source":   "yahoo",
                    "adjusted": False,
                })
                synced += 1

        if price_rows:
            upsert_prices(price_rows)
        update_holding_prices(user.user_id, price_map)

    computed_periods = await _run_compute(user.user_id)

    write_audit_log(
        event_type="portfolio.refresh",
        actor_id=user.user_id,
        resource="portfolio_snapshots_v2",
        metadata={"symbols_synced": synced, "periods_computed": len(computed_periods)},
    )

    return RefreshResult(
        symbols_synced=synced,
        symbols_failed=failed,
        periods_computed=computed_periods,
        refreshed_at=now,
    )
