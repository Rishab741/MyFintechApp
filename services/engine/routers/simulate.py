"""
/v1/simulate — Vestara Counterfactual Intelligence Engine router

Endpoints:
  POST /v1/simulate/scenario           → kick off async simulation, returns job_id
  GET  /v1/simulate/scenario/{job_id}  → poll status / retrieve results
  POST /v1/simulate/behavioral-profile → (re)build BTF profile for a user
  POST /v1/simulate/backfill-prices    → pre-warm price_cache for given symbols
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import date, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from calculations.behavioral import build_profile
from calculations.prices import get_prices_multi, get_coverage
from calculations.simulation import (
    BehavioralAdjuster,
    CashFlowReplayer,
    build_decision_tree,
    build_timeseries,
    compute_metrics,
    compute_toi,
    detect_inflection_points,
    run_monte_carlo,
)

log = logging.getLogger("engine.simulate")

router = APIRouter(tags=["simulate"])

# ── In-memory job store (production: replace with Redis or DB polling) ────────
_jobs: dict[str, dict[str, Any]] = {}


# ══════════════════════════════════════════════════════════════════════════════
# Request / Response models
# ══════════════════════════════════════════════════════════════════════════════

class ScenarioRequest(BaseModel):
    user_id:                    str
    run_id:                     str                          # scenario_runs PK from Supabase
    comparison_assets:          list[str]
    period_start:               Optional[date]   = None
    period_end:                 Optional[date]   = None
    initial_capital:            Optional[float]  = None
    rebalancing_strategy:       str              = "hold"
    apply_behavioral_adjustment: bool            = True
    apply_dividend_reinvestment: bool            = True
    run_monte_carlo:            bool             = False
    monthly_savings_assumption: float            = 1000.0


class BehavioralProfileRequest(BaseModel):
    user_id: str


class BackfillRequest(BaseModel):
    symbols:     list[str]
    start:       date = Field(default_factory=lambda: date.today() - timedelta(days=365 * 5))
    end:         date = Field(default_factory=date.today)


# ══════════════════════════════════════════════════════════════════════════════
# Dependency: Supabase client from app state
# ══════════════════════════════════════════════════════════════════════════════

def get_db(request: Request):
    return request.app.state.db


# ══════════════════════════════════════════════════════════════════════════════
# POST /v1/simulate/scenario
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/scenario")
async def start_scenario(body: ScenarioRequest, db=Depends(get_db)):
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "queued", "run_id": body.run_id}

    # Mark run as running in Supabase
    await db.table("scenario_runs").update({
        "status":        "running",
        "engine_job_id": job_id,
        "started_at":    date.today().isoformat(),
    }).eq("id", body.run_id).execute()

    asyncio.create_task(_run_scenario(job_id, body, db))
    return {"job_id": job_id, "status": "queued"}


# ══════════════════════════════════════════════════════════════════════════════
# GET /v1/simulate/scenario/{job_id}
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/scenario/{job_id}")
async def get_scenario_result(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_id not found")
    return job


# ══════════════════════════════════════════════════════════════════════════════
# POST /v1/simulate/behavioral-profile
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/behavioral-profile")
async def rebuild_behavioral_profile(body: BehavioralProfileRequest, db=Depends(get_db)):
    try:
        profile = await _compute_behavioral_profile(body.user_id, db)
        await _upsert_behavioral_profile(body.user_id, profile, db)
        return {"status": "ok", "profile_confidence": profile.get("profile_confidence")}
    except Exception as exc:
        log.exception("behavioral-profile failed for user %s", body.user_id)
        raise HTTPException(status_code=500, detail=str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# POST /v1/simulate/backfill-prices
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/backfill-prices")
async def backfill_prices(body: BackfillRequest, db=Depends(get_db)):
    results: dict[str, Any] = {}
    price_data = await get_prices_multi(db, body.symbols, body.start, body.end)
    for sym, df in price_data.items():
        results[sym] = {
            "rows_fetched":  len(df),
            "earliest_date": df["date"].min().isoformat() if not df.empty else None,
            "latest_date":   df["date"].max().isoformat() if not df.empty else None,
        }
    return {"status": "ok", "symbols": results}


# ══════════════════════════════════════════════════════════════════════════════
# Core async simulation task
# ══════════════════════════════════════════════════════════════════════════════

async def _run_scenario(job_id: str, req: ScenarioRequest, db) -> None:
    t0 = time.monotonic()
    try:
        _jobs[job_id]["status"] = "running"

        # ── Resolve date range ─────────────────────────────────────────────
        end   = req.period_end   or date.today()
        start = req.period_start or (end - timedelta(days=365))

        # ── Fetch user data ────────────────────────────────────────────────
        transactions = await _fetch_transactions(req.user_id, start, end, db)
        actual_nav   = await _fetch_portfolio_nav(req.user_id, start, end, db)
        profile      = await _load_or_build_profile(req.user_id, transactions, db)

        # ── Resolve actual NAV values and dates ────────────────────────────
        nav_dates  = [d for d, _ in actual_nav]
        nav_values = [v for _, v in actual_nav]

        if not nav_values:
            raise ValueError("No portfolio NAV data found for the requested period")

        initial_cap = req.initial_capital or nav_values[0]

        # ── Fetch comparison prices ────────────────────────────────────────
        price_data = await get_prices_multi(db, req.comparison_assets, start, end)

        # ── Replay cash flows into each comparison asset ───────────────────
        replayer  = CashFlowReplayer()
        adjuster  = BehavioralAdjuster()

        alt_navs: dict[str, list[float]] = {}   # perfect-hold simulation
        adj_navs: dict[str, list[float]] = {}   # behavioral-adjusted simulation
        alt_metrics: dict[str, dict]     = {}

        for sym in req.comparison_assets:
            prices = price_data.get(sym)
            if prices is None or prices.empty:
                log.warning("No price data for %s — skipping", sym)
                continue

            replayed = replayer.replay(
                cash_flows=transactions,
                prices=prices,
                initial_capital=initial_cap,
                start=start,
                end=end,
            )

            if replayed.empty:
                continue

            perfect_vals = replayed["portfolio_value"].tolist()
            alt_navs[sym] = perfect_vals

            if req.apply_behavioral_adjustment and profile.get("profile_confidence") != "insufficient":
                adjusted  = adjuster.adjust(replayed, profile, prices)
                adj_vals  = adjusted["adjusted_value"].tolist()
            else:
                adj_vals  = perfect_vals

            adj_navs[sym] = adj_vals
            alt_metrics[sym] = compute_metrics(
                adj_vals if req.apply_behavioral_adjustment else perfect_vals,
                label=sym,
            )

        # ── Actual portfolio metrics ───────────────────────────────────────
        actual_metrics = compute_metrics(nav_values, label="actual")

        # ── Decision Impact Tree ───────────────────────────────────────────
        decision_tree = build_decision_tree(
            cash_flows=transactions,
            actual_nav=nav_values,
            alt_navs=adj_navs,
            nav_dates=nav_dates,
        )

        # ── Inflection points ──────────────────────────────────────────────
        inflection_pts = detect_inflection_points(decision_tree, top_n=5)

        # ── Temporal Opportunity Index ─────────────────────────────────────
        toi = compute_toi(actual_metrics, alt_metrics, req.monthly_savings_assumption)

        # ── Monte Carlo (optional) ─────────────────────────────────────────
        mc_results: dict[str, Any] = {}
        if req.run_monte_carlo and nav_values:
            import numpy as np
            daily_returns = (np.diff(nav_values) / np.array(nav_values[:-1])).tolist()
            mc_results["actual"] = run_monte_carlo(
                daily_returns, nav_values[-1], n_days=252, n_simulations=1000,
            )
            for sym, adj_vals in adj_navs.items():
                if len(adj_vals) > 1:
                    dr = (np.diff(adj_vals) / np.array(adj_vals[:-1])).tolist()
                    mc_results[sym] = run_monte_carlo(dr, adj_vals[-1], n_days=252, n_simulations=1000)

        # ── Build output timeseries ────────────────────────────────────────
        timeseries = build_timeseries(nav_dates, nav_values, alt_navs, adj_navs)

        # ── Combine all metrics ────────────────────────────────────────────
        all_metrics = {"actual": actual_metrics, **alt_metrics}

        computation_ms = int((time.monotonic() - t0) * 1000)
        data_quality   = len(timeseries) / max(len(nav_dates), 1)

        result_payload = {
            "timeseries":                timeseries,
            "metrics":                   all_metrics,
            "decision_tree":             decision_tree,
            "inflection_points":         inflection_pts,
            "temporal_opportunity":      toi,
            "behavioral_profile_snapshot": profile,
            "monte_carlo":               mc_results or None,
            "computation_ms":            computation_ms,
            "data_quality_score":        round(data_quality, 3),
        }

        # ── Write results to Supabase ──────────────────────────────────────
        run_id = req.run_id
        await db.table("scenario_results").upsert({
            "run_id":                      run_id,
            "user_id":                     req.user_id,
            **result_payload,
        }).execute()

        await db.table("scenario_runs").update({
            "status":       "complete",
            "completed_at": date.today().isoformat(),
        }).eq("id", run_id).execute()

        _jobs[job_id] = {"status": "complete", "run_id": run_id, **result_payload}
        log.info("Scenario %s complete in %dms", job_id, computation_ms)

    except Exception as exc:
        log.exception("Scenario %s failed", job_id)
        error_msg = str(exc)
        _jobs[job_id] = {"status": "failed", "error": error_msg, "run_id": req.run_id}
        await db.table("scenario_runs").update({
            "status":        "failed",
            "completed_at":  date.today().isoformat(),
            "error_message": error_msg[:500],
        }).eq("id", req.run_id).execute()


# ══════════════════════════════════════════════════════════════════════════════
# Data fetchers (query Supabase directly as service role)
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_transactions(user_id: str, start: date, end: date, db) -> list[dict]:
    resp = await (
        db.table("transactions")
        .select("transaction_type,settled_at,symbol,quantity,price,net_amount")
        .eq("user_id", user_id)
        .gte("settled_at", start.isoformat())
        .lte("settled_at", end.isoformat())
        .order("settled_at")
        .execute()
    )
    return [
        {**r, "date": r.get("settled_at", "")[:10]}
        for r in (resp.data or [])
    ]


async def _fetch_portfolio_nav(
    user_id: str,
    start: date,
    end: date,
    db,
) -> list[tuple[date, float]]:
    resp = await (
        db.table("portfolio_snapshots_v2")
        .select("time,total_value")
        .eq("user_id", user_id)
        .gte("time", start.isoformat())
        .lte("time", end.isoformat())
        .order("time")
        .execute()
    )
    pairs: list[tuple[date, float]] = []
    for r in (resp.data or []):
        d   = date.fromisoformat(r["time"][:10])
        val = float(r.get("total_value") or 0)
        if val > 0:
            pairs.append((d, val))
    return pairs


async def _load_or_build_profile(user_id: str, transactions: list[dict], db) -> dict:
    resp = await db.table("behavioral_profiles").select("*").eq("user_id", user_id).execute()
    rows = resp.data or []
    if rows:
        return rows[0]
    # Build fresh
    profile = build_profile(transactions)
    await _upsert_behavioral_profile(user_id, profile, db)
    return profile


async def _compute_behavioral_profile(user_id: str, db) -> dict:
    """Fetch all transactions for user and compute BTF."""
    resp = await (
        db.table("transactions")
        .select("transaction_type,settled_at,symbol,quantity,price,net_amount")
        .eq("user_id", user_id)
        .order("settled_at")
        .execute()
    )
    transactions = [
        {**r, "date": r.get("settled_at", "")[:10]}
        for r in (resp.data or [])
    ]
    return build_profile(transactions)


async def _upsert_behavioral_profile(user_id: str, profile: dict, db) -> None:
    await db.table("behavioral_profiles").upsert(
        {"user_id": user_id, **profile},
        on_conflict="user_id",
    ).execute()
