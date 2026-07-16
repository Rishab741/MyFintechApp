"""
Behavioral finance metrics v2 (Phase 4) — the academically grounded upgrades.

Disposition effect  — Odean (1998): on each day the client sells anything,
    classify every position: sold winners = realized gains, sold losers =
    realized losses, held winners = paper gains, held losers = paper losses.
    PGR = RG/(RG+PG), PLR = RL/(RL+PL). Ratio PGR/PLR > 1 means the client
    preferentially cashes winners and rides losers — the classic pathology.

FOMO index          — mean trailing 20-trading-day return of each stock at the
    moment the client bought it. Systematically positive = chasing rallies.

True panic score    — fraction of sell orders executed while the BENCHMARK was
    ≥10% below its running peak (a market-wide drawdown, not just the
    position being down). Selling into market panics crystallises losses.

Turnover drag       — annual traded notional over mean portfolio value; each
    1x of turnover costs spread + brokerage + tax friction.

All functions are pure: prices arrive via PriceBook, nothing touches the
network, everything degrades to None instead of raising.
"""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import date, timedelta
from typing import Optional, TypedDict

from marketdata.prices import PriceBook

TRADING_DAYS = 252


class BehavioralV2(TypedDict):
    disposition_pgr:         Optional[float]   # proportion of gains realized
    disposition_plr:         Optional[float]   # proportion of losses realized
    disposition_ratio:       Optional[float]   # PGR/PLR — >1 is the pathology
    fomo_index_pct:          Optional[float]   # mean trailing 20d return at buys
    buys_after_rally_pct:    Optional[float]   # share of buys after >10% run-up
    market_panic_sell_pct:   Optional[float]   # sells during benchmark DD ≥10%
    annual_turnover_x:       Optional[float]
    trades_per_year:         float


def compute_behavioral_v2(
    trades: list[dict],
    book: PriceBook,
    benchmark_symbol: str | None,
    mean_portfolio_value: float | None,
) -> BehavioralV2:
    trades = sorted(trades, key=lambda t: t["_date"])
    first, last = trades[0]["_date"], trades[-1]["_date"]
    years = max((last - first).days / 365.25, 1 / 365.25)

    # ── Disposition effect (Odean day-level counting) ─────────────────────────
    # FIFO lots per symbol; on each sell day, count realized vs paper G/L.
    lots: dict[str, deque] = defaultdict(deque)        # symbol → deque[(qty, cost)]
    rg = rl = pg = pl = 0
    sell_days = sorted({t["_date"] for t in trades if t["transaction_type"] == "sell"})
    sells_by_day: dict[date, list[dict]] = defaultdict(list)
    for t in trades:
        if t["transaction_type"] == "sell":
            sells_by_day[t["_date"]].append(t)

    ti = 0
    for sd in sell_days:
        # Apply all trades strictly before this sell day to the lot book.
        while ti < len(trades) and trades[ti]["_date"] < sd:
            t = trades[ti]
            if t["transaction_type"] == "buy":
                lots[t["symbol"]].append([t["quantity"], t["price"]])
            ti += 1

        # Realized: the sells happening today, matched FIFO.
        sold_symbols: set[str] = set()
        for s in sells_by_day[sd]:
            sym, remaining, sell_price = s["symbol"], s["quantity"], s["price"]
            sold_symbols.add(sym)
            q = lots[sym]
            while remaining > 1e-9 and q:
                lot = q[0]
                take = min(lot[0], remaining)
                if sell_price > lot[1]:
                    rg += 1
                elif sell_price < lot[1]:
                    rl += 1
                lot[0] -= take
                remaining -= take
                if lot[0] <= 1e-9:
                    q.popleft()

        # Paper: every other open position with a price that day.
        for sym, q in lots.items():
            if sym in sold_symbols or not q:
                continue
            p = book.price_on(sym, sd)
            if p is None:
                continue
            total_q = sum(l[0] for l in q)
            if total_q <= 1e-9:
                continue
            avg_cost = sum(l[0] * l[1] for l in q) / total_q
            if p > avg_cost:
                pg += 1
            elif p < avg_cost:
                pl += 1

    pgr = rg / (rg + pg) if (rg + pg) > 0 else None
    plr = rl / (rl + pl) if (rl + pl) > 0 else None
    disp_ratio = (pgr / plr) if (pgr is not None and plr not in (None, 0)) else None

    # ── FOMO index ────────────────────────────────────────────────────────────
    trailing: list[float] = []
    for t in trades:
        if t["transaction_type"] != "buy":
            continue
        p_now  = book.price_on(t["symbol"], t["_date"])
        p_then = book.price_on(t["symbol"], t["_date"] - timedelta(days=28))  # ≈20 trading days
        if p_now and p_then and p_then > 0:
            trailing.append(p_now / p_then - 1.0)

    fomo   = (sum(trailing) / len(trailing)) if trailing else None
    rallies = (sum(1 for r in trailing if r > 0.10) / len(trailing)) if trailing else None

    # ── True panic: sells during benchmark drawdowns ≥10% ─────────────────────
    panic_pct: Optional[float] = None
    if benchmark_symbol and book.has(benchmark_symbol):
        bench = dict(book.series_between(benchmark_symbol, first - timedelta(days=7), last))
        if bench:
            # Running peak → drawdown per day
            dd_by_day: dict[date, float] = {}
            peak = 0.0
            for d in sorted(bench):
                peak = max(peak, bench[d])
                dd_by_day[d] = bench[d] / peak - 1.0 if peak > 0 else 0.0

            def dd_on(d: date) -> Optional[float]:
                for back in range(8):
                    v = dd_by_day.get(d - timedelta(days=back))
                    if v is not None:
                        return v
                return None

            sells = [t for t in trades if t["transaction_type"] == "sell"]
            scored = [(dd_on(t["_date"])) for t in sells]
            scored = [s for s in scored if s is not None]
            if scored:
                panic_pct = sum(1 for s in scored if s <= -0.10) / len(scored)

    # ── Turnover ──────────────────────────────────────────────────────────────
    turnover: Optional[float] = None
    if mean_portfolio_value and mean_portfolio_value > 0:
        notional = sum(t["price"] * t["quantity"] for t in trades)
        turnover = (notional / 2.0) / years / mean_portfolio_value

    return BehavioralV2(
        disposition_pgr=round(pgr, 4) if pgr is not None else None,
        disposition_plr=round(plr, 4) if plr is not None else None,
        disposition_ratio=round(disp_ratio, 2) if disp_ratio is not None else None,
        fomo_index_pct=round(fomo * 100, 2) if fomo is not None else None,
        buys_after_rally_pct=round(rallies * 100, 2) if rallies is not None else None,
        market_panic_sell_pct=round(panic_pct * 100, 2) if panic_pct is not None else None,
        annual_turnover_x=round(turnover, 2) if turnover is not None else None,
        trades_per_year=round(len(trades) / years, 1),
    )
