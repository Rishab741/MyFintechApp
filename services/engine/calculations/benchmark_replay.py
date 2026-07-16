"""
Benchmark replay — the opportunity-cost engine (Phase 2).

Answers the one question that closes advisory clients:

    "If every dollar you moved in and out of the market had gone into the
     index on the same days, what would you have today?"

Method:
  - Every BUY becomes a purchase of benchmark units at that day's close.
  - Every SELL withdraws the same dollar amount by selling benchmark units
    (capped at units held — a client can't short the counterfactual).
  - End value = remaining units × latest benchmark close.
  - The benchmark's dollar-weighted return is computed with the same IRR
    (compute_mwr) used for the client, so the two numbers are comparable.

Everything here is pure — prices come in as a PriceBook, so the logic is
deterministic and unit-testable without any network access.
"""

from __future__ import annotations

from datetime import date
from typing import TypedDict

from calculations.returns import compute_mwr
from marketdata.prices import PriceBook


class BenchmarkPoint(TypedDict):
    date:  str
    value: float          # benchmark counterfactual portfolio value that day


class BenchmarkReplayResult(TypedDict):
    benchmark_symbol:         str
    benchmark_end_value:      float
    benchmark_mwr_annualized: float    # percent
    client_mwr_annualized:    float    # percent (same IRR method — comparable)
    alpha_pp:                 float    # client − benchmark, percentage points
    opportunity_cost_dollars: float    # benchmark end value − client end value
    replay_coverage:          float    # fraction of flow dollars that had a price
    path:                     list[BenchmarkPoint]


def replay(
    flows: list[tuple[date, float]],       # (date, signed cash: buy<0, sell>0)
    client_end_value: float,
    client_mwr: float,                     # raw fraction from compute_mwr
    book: PriceBook,
    benchmark_symbol: str,
) -> BenchmarkReplayResult | None:
    """
    Replay the client's cash-flow schedule into the benchmark.
    Returns None when the benchmark has no usable prices (degrade, don't fail).
    """
    if not flows or not book.has(benchmark_symbol):
        return None

    flows = sorted(flows, key=lambda f: f[0])

    units          = 0.0
    covered        = 0.0
    total_absflow  = 0.0
    path: list[BenchmarkPoint] = []
    replay_flows: list[tuple[date, float]] = []   # what actually got replayed

    for d, cash in flows:
        total_absflow += abs(cash)
        price = book.price_on(benchmark_symbol, d)
        if price is None or price <= 0:
            continue                              # no price that day → skip flow

        if cash < 0:
            # Client deployed capital → buy benchmark units.
            units += (-cash) / price
            replay_flows.append((d, cash))
        else:
            # Client withdrew via a sell → withdraw same dollars, capped.
            withdraw_units = min(cash / price, units)
            if withdraw_units <= 0:
                continue
            units -= withdraw_units
            replay_flows.append((d, withdraw_units * price))

        covered += abs(cash)
        path.append(BenchmarkPoint(date=d.isoformat(), value=round(units * price, 2)))

    if not replay_flows:
        return None

    last_price = book.latest(benchmark_symbol)
    if last_price is None:
        return None

    end_value = units * last_price
    if path:
        latest_dt = book.latest_date(benchmark_symbol)
        if latest_dt:
            path.append(BenchmarkPoint(date=latest_dt.isoformat(), value=round(end_value, 2)))

    # Same IRR machinery as the client's MWR → apples-to-apples.
    bench_mwr = compute_mwr(
        [cash for _, cash in replay_flows],
        [d for d, _ in replay_flows],
        final_value=end_value,
    )

    return BenchmarkReplayResult(
        benchmark_symbol=benchmark_symbol,
        benchmark_end_value=round(end_value, 2),
        benchmark_mwr_annualized=round(bench_mwr * 100, 2),
        client_mwr_annualized=round(client_mwr * 100, 2),
        alpha_pp=round((client_mwr - bench_mwr) * 100, 2),
        opportunity_cost_dollars=round(end_value - client_end_value, 2),
        replay_coverage=round(covered / total_absflow, 4) if total_absflow else 0.0,
        path=path,
    )


def estimate_live_portfolio_value(
    trades: list[dict],
    book: PriceBook,
) -> tuple[float, float]:
    """
    Value open positions at LIVE prices where available, falling back to the
    last transaction price per symbol.

    Returns (value, live_coverage) where live_coverage is the fraction of the
    valuation backed by live market prices rather than stale trade prices.
    """
    qty_held:   dict[str, float] = {}
    last_trade: dict[str, float] = {}

    for t in trades:
        sym = t["symbol"]
        last_trade[sym] = t["price"]
        if t["transaction_type"] == "buy":
            qty_held[sym] = qty_held.get(sym, 0.0) + t["quantity"]
        else:
            qty_held[sym] = max(0.0, qty_held.get(sym, 0.0) - t["quantity"])

    total = 0.0
    live  = 0.0
    for sym, qty in qty_held.items():
        if qty <= 0:
            continue
        live_price = book.latest(sym)
        if live_price is not None and live_price > 0:
            total += qty * live_price
            live  += qty * live_price
        else:
            total += qty * last_trade.get(sym, 0.0)

    return total, (live / total if total > 0 else 0.0)
