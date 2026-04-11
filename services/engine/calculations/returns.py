"""
Return calculations: TWR, MWR/IRR, CAGR, period slicing.

All functions operate on plain Python lists / numpy arrays of floats.
No Supabase or HTTP calls here — pure math that is easy to unit-test.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Sequence

import numpy as np
from scipy.optimize import brentq


# ── Time-Weighted Return (TWR) ────────────────────────────────────────────────
def compute_twr(values: Sequence[float]) -> float:
    """
    Chain-link daily sub-period returns to produce the time-weighted return.

    TWR removes the distortion caused by the timing of external cash flows
    (deposits / withdrawals).  Since we don't yet have transaction data, we
    treat every consecutive snapshot pair as a clean sub-period.

    Returns a decimal — e.g. 0.15 means +15 %.
    Returns 0.0 if fewer than 2 data points are available.
    """
    vals = [v for v in values if v > 0]
    if len(vals) < 2:
        return 0.0

    product = 1.0
    for i in range(1, len(vals)):
        if vals[i - 1] > 0:
            product *= vals[i] / vals[i - 1]

    return product - 1.0


# ── CAGR ──────────────────────────────────────────────────────────────────────
def compute_cagr(start_value: float, end_value: float, days: int) -> float:
    """
    Compound Annual Growth Rate.

    CAGR = (end / start) ^ (365 / days) - 1

    Returns 0.0 if start_value is zero or days < 1.
    """
    if start_value <= 0 or end_value <= 0 or days < 1:
        return 0.0
    years = days / 365.0
    if years < 1 / 365:
        return 0.0
    return (end_value / start_value) ** (1.0 / years) - 1.0


# ── Daily returns ─────────────────────────────────────────────────────────────
def compute_daily_returns(values: Sequence[float]) -> list[float]:
    """
    Convert a series of NAV values into daily percentage returns.

    Returns a list one element shorter than the input.
    Zero or negative values are skipped (treated as missing data).
    """
    returns: list[float] = []
    vals = list(values)
    for i in range(1, len(vals)):
        prev = vals[i - 1]
        curr = vals[i]
        if prev > 0 and curr > 0:
            returns.append((curr - prev) / prev)
        else:
            # Missing data — insert 0 so indices stay aligned with snapshot dates
            returns.append(0.0)
    return returns


# ── Money-Weighted Return / IRR ───────────────────────────────────────────────
def compute_mwr(
    cash_flows: Sequence[float],
    dates: Sequence[date],
    final_value: float,
) -> float:
    """
    Money-Weighted Return (internal rate of return) via Brent's method.

    cash_flows: negative for deposits, positive for withdrawals.
    dates: matching dates for each cash flow.
    final_value: current portfolio value (treated as a positive cash flow at today).

    Returns 0.0 if no valid solution is found.
    """
    if not cash_flows or not dates or len(cash_flows) != len(dates):
        return 0.0

    all_dates = list(dates) + [date.today()]
    all_flows = list(cash_flows) + [final_value]

    t0 = all_dates[0]
    t_years = [(d - t0).days / 365.0 for d in all_dates]

    def npv(rate: float) -> float:
        return sum(cf / (1 + rate) ** t for cf, t in zip(all_flows, t_years))

    try:
        irr = brentq(npv, -0.999, 100.0, maxiter=500)
        return float(irr)
    except (ValueError, RuntimeError):
        return 0.0


# ── Period slicing ────────────────────────────────────────────────────────────
PERIOD_DAYS: dict[str, int | None] = {
    "1D":  1,
    "1W":  7,
    "1M":  30,
    "3M":  90,
    "6M":  180,
    "YTD": None,   # handled specially
    "1Y":  365,
    "ALL": None,   # no cutoff
}


def slice_by_period(
    values: Sequence[float],
    timestamps: Sequence[datetime],
    period: str,
) -> tuple[list[float], list[datetime]]:
    """
    Return (values, timestamps) sliced to the requested period.

    For YTD: from Jan 1 of the current year.
    For ALL: the full series.
    For everything else: last N calendar days.
    """
    if not values or not timestamps:
        return [], []

    now = datetime.now(tz=timezone.utc)

    if period == "ALL":
        return list(values), list(timestamps)

    if period == "YTD":
        cutoff = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    else:
        days = PERIOD_DAYS.get(period, 30) or 30
        cutoff = now - timedelta(days=days)

    pairs = [
        (v, t)
        for v, t in zip(values, timestamps)
        if t >= cutoff
    ]

    if len(pairs) < 2:
        # Fall back to the full series if the window is too narrow
        return list(values), list(timestamps)

    vs, ts = zip(*pairs)
    return list(vs), list(ts)


# ── Period return ─────────────────────────────────────────────────────────────
def compute_period_return(values: Sequence[float]) -> float:
    """Simple holding-period return: (end - start) / start."""
    vals = [v for v in values if v > 0]
    if len(vals) < 2:
        return 0.0
    return (vals[-1] - vals[0]) / vals[0]


# ── Annualised return ─────────────────────────────────────────────────────────
def annualise_return(period_return: float, days: int) -> float:
    """Convert a holding-period return to an annualised figure."""
    if days < 1:
        return 0.0
    return (1 + period_return) ** (365.0 / days) - 1.0
