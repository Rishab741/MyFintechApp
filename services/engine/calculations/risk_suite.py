"""
Institutional risk suite (Phase 3).

Reconstructs the client's daily portfolio value from their trade history and
the PriceBook, converts it to a flow-adjusted daily return series, and computes
the metrics every institutional reviewer looks for first.

Flow adjustment: a deposit (buy) inflates value without being a return, and a
sell deflates it. Daily return is computed as
    r_t = (V_t - F_t) / V_{t-1} - 1
where F_t is the net external flow that day (buy notional in, sell notional
out). This is the standard TWR daily-linking method.

Coverage guard: if less than half the portfolio's traded symbols have price
data, the series is too incomplete to be honest — return None and let the
report degrade rather than publish misleading risk numbers.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Optional, TypedDict

from marketdata.prices import PriceBook

TRADING_DAYS = 252
RISK_FREE_ANNUAL = 0.04     # cash-rate proxy; stated in the methodology notes


class RiskSuite(TypedDict):
    twr_annualized_pct:    float
    volatility_pct:        float            # annualized
    sharpe:                Optional[float]
    sortino:               Optional[float]
    max_drawdown_pct:      float
    max_drawdown_peak:     str              # ISO date
    max_drawdown_trough:   str
    cvar_95_daily_pct:     float            # mean of worst 5% daily returns
    beta:                  Optional[float]  # vs benchmark; None if no benchmark
    mean_portfolio_value:  float
    price_coverage:        float            # traded symbols with price data
    observation_days:      int


def _daily_flows(trades: list[dict]) -> dict[date, float]:
    """Net external flow per day: buys add capital (+), sells remove (−)."""
    flows: dict[date, float] = {}
    for t in trades:
        notional = t["price"] * t["quantity"]
        signed = notional if t["transaction_type"] == "buy" else -notional
        flows[t["_date"]] = flows.get(t["_date"], 0.0) + signed
    return flows


def compute_risk_suite(
    trades: list[dict],
    book: PriceBook,
    benchmark_symbol: str | None,
) -> RiskSuite | None:
    symbols = sorted({t["symbol"] for t in trades})
    priced  = [s for s in symbols if book.has(s)]
    coverage = len(priced) / len(symbols) if symbols else 0.0
    if coverage < 0.5:
        return None

    start = min(t["_date"] for t in trades)
    end_candidates = [book.latest_date(s) for s in priced]
    end = max(d for d in end_candidates if d is not None)
    if (end - start).days < 30:
        return None                              # too short to say anything honest

    flows = _daily_flows(trades)

    # ── Daily value series (priced symbols only) ──────────────────────────────
    qty: dict[str, float] = {s: 0.0 for s in priced}
    trades_by_day: dict[date, list[dict]] = {}
    for t in trades:
        trades_by_day.setdefault(t["_date"], []).append(t)

    values: list[tuple[date, float]] = []
    d = start
    while d <= end:
        for t in trades_by_day.get(d, ()):
            s = t["symbol"]
            if s not in qty:
                continue
            if t["transaction_type"] == "buy":
                qty[s] += t["quantity"]
            else:
                qty[s] = max(0.0, qty[s] - t["quantity"])
        if d.weekday() < 5:                       # trading days only
            v = 0.0
            for s, q in qty.items():
                if q <= 0:
                    continue
                p = book.price_on(s, d)
                if p:
                    v += q * p
            values.append((d, v))
        d += timedelta(days=1)

    # ── Flow-adjusted daily returns ───────────────────────────────────────────
    rets:       list[float] = []
    ret_dates:  list[date]  = []
    for i in range(1, len(values)):
        d_prev, v_prev = values[i - 1]
        d_cur,  v_cur  = values[i]
        if v_prev <= 0:
            continue
        # Sum flows on all calendar days since the previous valuation.
        f = sum(
            flows.get(d_prev + timedelta(days=k), 0.0)
            for k in range(1, (d_cur - d_prev).days + 1)
        )
        r = (v_cur - f) / v_prev - 1.0
        if -0.5 < r < 0.5:                        # guard against data glitches
            rets.append(r)
            ret_dates.append(d_cur)

    n = len(rets)
    if n < 20:
        return None

    mean_r = sum(rets) / n
    var    = sum((r - mean_r) ** 2 for r in rets) / (n - 1)
    vol_d  = math.sqrt(var)
    vol_a  = vol_d * math.sqrt(TRADING_DAYS)

    # ── TWR ───────────────────────────────────────────────────────────────────
    wealth = 1.0
    for r in rets:
        wealth *= (1.0 + r)
    twr_a = wealth ** (TRADING_DAYS / n) - 1.0

    # ── Sharpe / Sortino ──────────────────────────────────────────────────────
    excess_a = twr_a - RISK_FREE_ANNUAL
    sharpe   = excess_a / vol_a if vol_a > 1e-9 else None

    downside = [r for r in rets if r < 0]
    if downside:
        dvar   = sum(r ** 2 for r in downside) / n
        dvol_a = math.sqrt(dvar) * math.sqrt(TRADING_DAYS)
        sortino = excess_a / dvol_a if dvol_a > 1e-9 else None
    else:
        sortino = None

    # ── Max drawdown on the wealth index ──────────────────────────────────────
    peak_w, peak_i = 1.0, 0
    max_dd, dd_peak_i, dd_trough_i = 0.0, 0, 0
    w = 1.0
    for i, r in enumerate(rets):
        w *= (1.0 + r)
        if w > peak_w:
            peak_w, peak_i = w, i
        dd = w / peak_w - 1.0
        if dd < max_dd:
            max_dd, dd_peak_i, dd_trough_i = dd, peak_i, i

    # ── CVaR 95 (daily) ───────────────────────────────────────────────────────
    sorted_r = sorted(rets)
    tail = sorted_r[: max(1, n // 20)]
    cvar95 = -(sum(tail) / len(tail))

    # ── Beta vs benchmark ─────────────────────────────────────────────────────
    beta: Optional[float] = None
    if benchmark_symbol and book.has(benchmark_symbol):
        bench_r: list[float] = []
        port_r:  list[float] = []
        prev_bp: Optional[float] = None
        prev_d:  Optional[date]  = None
        for d_cur, r in zip(ret_dates, rets):
            bp = book.price_on(benchmark_symbol, d_cur)
            if bp and prev_bp and prev_d:
                bench_r.append(bp / prev_bp - 1.0)
                port_r.append(r)
            prev_bp, prev_d = bp, d_cur
        if len(bench_r) >= 20:
            mb = sum(bench_r) / len(bench_r)
            mp = sum(port_r) / len(port_r)
            cov  = sum((b - mb) * (p - mp) for b, p in zip(bench_r, port_r)) / (len(bench_r) - 1)
            bvar = sum((b - mb) ** 2 for b in bench_r) / (len(bench_r) - 1)
            if bvar > 1e-12:
                beta = cov / bvar

    mean_value = sum(v for _, v in values if v > 0) / max(1, sum(1 for _, v in values if v > 0))

    return RiskSuite(
        twr_annualized_pct=round(twr_a * 100, 2),
        volatility_pct=round(vol_a * 100, 2),
        sharpe=round(sharpe, 2) if sharpe is not None else None,
        sortino=round(sortino, 2) if sortino is not None else None,
        max_drawdown_pct=round(max_dd * 100, 2),
        max_drawdown_peak=ret_dates[dd_peak_i].isoformat() if rets else "",
        max_drawdown_trough=ret_dates[dd_trough_i].isoformat() if rets else "",
        cvar_95_daily_pct=round(cvar95 * 100, 2),
        beta=round(beta, 2) if beta is not None else None,
        mean_portfolio_value=round(mean_value, 2),
        price_coverage=round(coverage, 4),
        observation_days=n,
    )
