"""
Monte Carlo wealth projection (Phase 7).

Projects the client's current portfolio forward under two regimes:
  CURRENT     — their own realized annualized return and volatility
  DISCIPLINED — the benchmark's return and volatility (systematic indexing)

Model: geometric Brownian motion, monthly steps, 1,000 paths per regime.
GBM understates tail risk (fat tails, volatility clustering) — stated in the
report's methodology appendix; for a 10–20 year *comparative* projection the
bias applies to both regimes equally, which is what makes the comparison fair.

Deterministic (fixed seed): the same inputs always produce the same bands.
Inputs are clamped to sane ranges so a 3-month lucky streak doesn't
extrapolate into absurd compounding.
"""

from __future__ import annotations

import math
import random
from typing import TypedDict

_PATHS = 1000
_SEED  = 20260716
_MU_CLAMP    = (-0.15, 0.25)   # annualized drift clamp
_SIGMA_CLAMP = (0.05, 0.60)    # annualized vol clamp


class ProjectionYear(TypedDict):
    year:    int
    cur_p10: float
    cur_p50: float
    cur_p90: float
    dis_p10: float
    dis_p50: float
    dis_p90: float


class ProjectionResult(TypedDict):
    horizon_years:     int
    start_value:       float
    mu_current:        float    # clamped values actually used (report them!)
    sigma_current:     float
    mu_disciplined:    float
    sigma_disciplined: float
    yearly:            list[ProjectionYear]
    terminal_gap_p50:  float    # disciplined median − current median at horizon


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _simulate(
    start: float, mu: float, sigma: float, years: int, rng: random.Random,
) -> list[list[float]]:
    """Return per-path yearly values (paths × years)."""
    dt = 1.0 / 12.0
    drift = (mu - 0.5 * sigma * sigma) * dt
    shock = sigma * math.sqrt(dt)
    out: list[list[float]] = []
    for _ in range(_PATHS):
        v = start
        yearly: list[float] = []
        for m in range(years * 12):
            v *= math.exp(drift + shock * rng.gauss(0.0, 1.0))
            if (m + 1) % 12 == 0:
                yearly.append(v)
        out.append(yearly)
    return out


def _percentiles(paths: list[list[float]], year_idx: int) -> tuple[float, float, float]:
    vals = sorted(p[year_idx] for p in paths)
    n = len(vals)
    return (
        vals[int(0.10 * n)],
        vals[int(0.50 * n)],
        vals[min(n - 1, int(0.90 * n))],
    )


def project(
    start_value:       float,
    mu_current:        float,   # annualized fraction, e.g. 0.06
    sigma_current:     float,
    mu_disciplined:    float,
    sigma_disciplined: float,
    horizon_years:     int = 20,
) -> ProjectionResult | None:
    if start_value <= 0:
        return None

    mu_c = _clamp(mu_current,        *_MU_CLAMP)
    mu_d = _clamp(mu_disciplined,    *_MU_CLAMP)
    sg_c = _clamp(sigma_current,     *_SIGMA_CLAMP)
    sg_d = _clamp(sigma_disciplined, *_SIGMA_CLAMP)

    rng_c = random.Random(_SEED)
    rng_d = random.Random(_SEED + 1)
    cur = _simulate(start_value, mu_c, sg_c, horizon_years, rng_c)
    dis = _simulate(start_value, mu_d, sg_d, horizon_years, rng_d)

    yearly: list[ProjectionYear] = []
    for y in range(horizon_years):
        c10, c50, c90 = _percentiles(cur, y)
        d10, d50, d90 = _percentiles(dis, y)
        yearly.append(ProjectionYear(
            year=y + 1,
            cur_p10=round(c10, 2), cur_p50=round(c50, 2), cur_p90=round(c90, 2),
            dis_p10=round(d10, 2), dis_p50=round(d50, 2), dis_p90=round(d90, 2),
        ))

    return ProjectionResult(
        horizon_years=horizon_years,
        start_value=round(start_value, 2),
        mu_current=round(mu_c, 4),
        sigma_current=round(sg_c, 4),
        mu_disciplined=round(mu_d, 4),
        sigma_disciplined=round(sg_d, 4),
        yearly=yearly,
        terminal_gap_p50=round(yearly[-1]["dis_p50"] - yearly[-1]["cur_p50"], 2),
    )
