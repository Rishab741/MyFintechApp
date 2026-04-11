"""
Risk metric calculations: Sharpe, Sortino, Beta, Alpha, Drawdown, VaR, CVaR.

All functions are pure — no I/O.  Inputs are plain Python sequences of floats.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np


# ── Sharpe Ratio ──────────────────────────────────────────────────────────────
def compute_sharpe(
    daily_returns: Sequence[float],
    rf_daily: float = 0.0,
) -> float:
    """
    Annualised Sharpe ratio.

    Sharpe = (mean_daily_excess_return / std_daily_excess_return) × √252

    Uses the sample standard deviation (ddof=1) to be unbiased.
    Returns 0.0 if fewer than 3 data points or std is zero.
    """
    r = np.array([x for x in daily_returns if x != 0.0 or True], dtype=float)
    if len(r) < 3:
        return 0.0

    excess = r - rf_daily
    std = float(np.std(excess, ddof=1))
    if std == 0:
        return 0.0

    return float(np.mean(excess) / std * math.sqrt(252))


# ── Sortino Ratio ─────────────────────────────────────────────────────────────
def compute_sortino(
    daily_returns: Sequence[float],
    rf_daily: float = 0.0,
    target: float = 0.0,
) -> float:
    """
    Annualised Sortino ratio.

    Uses downside deviation (only negative returns relative to `target`)
    as the denominator, penalising downside volatility only.

    Sortino = (mean_return - rf) / downside_std × √252
    """
    r = np.array(daily_returns, dtype=float)
    if len(r) < 3:
        return 0.0

    downside = r[r < target]
    if len(downside) == 0:
        return float("inf")   # no losing days in this period

    downside_std = float(np.sqrt(np.mean(downside ** 2)))
    if downside_std == 0:
        return 0.0

    mean_excess = float(np.mean(r)) - rf_daily
    return float(mean_excess / downside_std * math.sqrt(252))


# ── Beta ──────────────────────────────────────────────────────────────────────
def compute_beta(
    portfolio_returns: Sequence[float],
    benchmark_returns: Sequence[float],
) -> float:
    """
    Portfolio beta vs benchmark.

    Beta = Cov(P, B) / Var(B)

    Aligns the two series by length (takes the shorter).
    Returns 1.0 (market-neutral assumption) if fewer than 5 aligned points.
    """
    p = np.array(portfolio_returns, dtype=float)
    b = np.array(benchmark_returns, dtype=float)

    # Align lengths
    n = min(len(p), len(b))
    if n < 5:
        return 1.0

    p, b = p[-n:], b[-n:]

    cov_matrix = np.cov(p, b, ddof=1)
    var_b = cov_matrix[1, 1]

    if var_b == 0:
        return 1.0

    return float(cov_matrix[0, 1] / var_b)


# ── Alpha (Jensen's Alpha) ────────────────────────────────────────────────────
def compute_alpha(
    portfolio_return_annual: float,
    benchmark_return_annual: float,
    beta: float,
    rf_annual: float = 0.045,
) -> float:
    """
    Jensen's Alpha (annualised).

    α = R_p - [R_f + β × (R_m - R_f)]

    All inputs should be decimal annualised returns (0.15 = 15 %).
    """
    return portfolio_return_annual - (rf_annual + beta * (benchmark_return_annual - rf_annual))


# ── Max Drawdown ──────────────────────────────────────────────────────────────
def compute_max_drawdown(
    values: Sequence[float],
) -> tuple[float, int]:
    """
    Maximum peak-to-trough drawdown and its duration in calendar days.

    Returns (max_drawdown, drawdown_days).
    max_drawdown is a negative decimal: -0.25 means -25 %.
    drawdown_days is the number of days from peak to trough.

    Returns (0.0, 0) if fewer than 2 non-zero values.
    """
    vals = np.array([v for v in values if v > 0], dtype=float)
    if len(vals) < 2:
        return 0.0, 0

    running_max = np.maximum.accumulate(vals)
    drawdowns = (vals - running_max) / running_max  # all ≤ 0

    max_dd = float(np.min(drawdowns))
    trough_idx = int(np.argmin(drawdowns))

    # Find the peak before the trough
    peak_idx = int(np.argmax(vals[:trough_idx + 1]))
    drawdown_days = trough_idx - peak_idx

    return max_dd, drawdown_days


# ── Value at Risk (Historical) ────────────────────────────────────────────────
def compute_var(
    daily_returns: Sequence[float],
    confidence: float = 0.95,
) -> float:
    """
    Historical Value at Risk at the given confidence level.

    VaR_95 = 5th percentile of the daily return distribution.
    Returns a negative decimal: -0.02 means "on a bad day you lose 2 %".
    Returns 0.0 if fewer than 20 data points (not statistically meaningful).
    """
    r = np.array(daily_returns, dtype=float)
    if len(r) < 20:
        return 0.0
    return float(np.percentile(r, (1 - confidence) * 100))


# ── Conditional VaR / Expected Shortfall ─────────────────────────────────────
def compute_cvar(
    daily_returns: Sequence[float],
    confidence: float = 0.95,
) -> float:
    """
    Conditional VaR (Expected Shortfall) — the mean return of all days
    worse than the VaR threshold.  A more complete tail-risk measure than VaR.

    Returns 0.0 if fewer than 20 data points.
    """
    r = np.array(daily_returns, dtype=float)
    if len(r) < 20:
        return 0.0
    var = compute_var(r, confidence)
    tail = r[r <= var]
    return float(np.mean(tail)) if len(tail) > 0 else var


# ── Win Rate ──────────────────────────────────────────────────────────────────
def compute_win_rate(daily_returns: Sequence[float]) -> float:
    """Fraction of days with a non-negative return."""
    r = np.array(daily_returns, dtype=float)
    if len(r) == 0:
        return 0.0
    return float(np.sum(r >= 0) / len(r))


# ── Volatility ────────────────────────────────────────────────────────────────
def compute_volatility(daily_returns: Sequence[float]) -> float:
    """Annualised standard deviation of daily returns (sample)."""
    r = np.array(daily_returns, dtype=float)
    if len(r) < 3:
        return 0.0
    return float(np.std(r, ddof=1) * math.sqrt(252))


# ── Calmar Ratio ──────────────────────────────────────────────────────────────
def compute_calmar(cagr: float, max_drawdown: float) -> float:
    """
    Calmar = CAGR / |max_drawdown|.
    High Calmar (>1) means the return-per-unit-of-drawdown-risk is strong.
    Returns 0.0 if max_drawdown is 0.
    """
    if max_drawdown >= 0:
        return 0.0
    return cagr / abs(max_drawdown)


# ── Correlation ───────────────────────────────────────────────────────────────
def compute_correlation(
    portfolio_returns: Sequence[float],
    benchmark_returns: Sequence[float],
) -> float:
    """
    Pearson correlation between portfolio and benchmark daily returns.
    Returns 0.0 if insufficient data.
    """
    p = np.array(portfolio_returns, dtype=float)
    b = np.array(benchmark_returns, dtype=float)
    n = min(len(p), len(b))
    if n < 5:
        return 0.0
    p, b = p[-n:], b[-n:]
    corr = np.corrcoef(p, b)
    return float(corr[0, 1]) if corr.shape == (2, 2) else 0.0


# ── Volatility regime ─────────────────────────────────────────────────────────
def classify_volatility_regime(ann_volatility: float) -> str:
    """
    Map annualised volatility to a human-readable regime label.
    Thresholds match the ml-pipeline edge function for consistency.
    """
    if ann_volatility < 0.08:
        return "low"
    if ann_volatility < 0.15:
        return "normal"
    if ann_volatility < 0.25:
        return "elevated"
    return "high"
