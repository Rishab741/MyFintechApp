"""
Vestara Counterfactual Intelligence Engine — Core Simulation

Modules:
  CashFlowReplayer    — maps user's real cash flows into alternative assets
  BehavioralAdjuster  — applies BTF to simulate realistic exits/entries
  PerformanceEngine   — computes Sharpe, Sortino, drawdown, VaR, alpha, beta
  DecisionTreeBuilder — builds the Decision Impact Tree (DIT)
  TOICalculator       — Temporal Opportunity Index
  MonteCarloEngine    — 1,000-path bootstrap simulation
  InflectionDetector  — ranks the top-N decisions by portfolio impact
"""

from __future__ import annotations

import logging
import random
from datetime import date, timedelta
from statistics import mean, stdev
from typing import Any, Optional

import numpy as np
import pandas as pd

log = logging.getLogger("engine.simulation")

TRADING_DAYS_PER_YEAR = 252
RISK_FREE_RATE        = 0.05   # annualised, used for Sharpe / Sortino


# ══════════════════════════════════════════════════════════════════════════════
# 1. CashFlowReplayer
# ══════════════════════════════════════════════════════════════════════════════

class CashFlowReplayer:
    """
    Takes the user's actual cash-flow events (buys, sells, deposits, withdrawals)
    and replays them into one or more alternative assets to produce a synthetic
    NAV time series.

    For each buy/deposit event:  invest the same dollar amount into the alternative.
    For each sell/withdrawal:    liquidate the same dollar amount from the alternative.
    """

    def replay(
        self,
        cash_flows: list[dict[str, Any]],
        prices: pd.DataFrame,              # columns: date, adj_close
        initial_capital: Optional[float],
        start: date,
        end: date,
    ) -> pd.DataFrame:
        """
        Return a daily NAV DataFrame: columns [date, units, cash, portfolio_value].

        cash_flows: list of {date, transaction_type, net_amount}
          net_amount is negative for purchases (cash out) and positive for sales.
        prices: daily adj_close for the comparison asset.
        initial_capital: if set, seed this amount on `start`; otherwise use cash_flows only.
        """
        price_map = {row.date: float(row.adj_close) for row in prices.itertuples(index=False)}

        units = 0.0
        cash  = float(initial_capital) if initial_capital else 0.0

        # Sort cash flows
        events = sorted(
            [cf for cf in cash_flows if start <= _parse_date(cf["date"]) <= end],
            key=lambda x: _parse_date(x["date"]),
        )

        # Build daily series
        all_dates = pd.bdate_range(start=start, end=end)
        ev_iter   = iter(events)
        next_ev   = next(ev_iter, None)

        records: list[dict] = []

        for ts in all_dates:
            d = ts.date()
            price = price_map.get(d)
            if price is None:
                # Use last known price (carry forward)
                price = records[-1]["price"] if records else None

            # Apply any cash flows on this date
            while next_ev and _parse_date(next_ev["date"]) == d:
                net = float(next_ev.get("net_amount", 0) or 0)
                tx_type = next_ev.get("transaction_type", "")

                if tx_type in ("buy", "deposit") and price:
                    amount_to_invest = abs(net)
                    units += amount_to_invest / price
                    cash  -= amount_to_invest
                elif tx_type in ("sell", "withdrawal") and units > 0 and price:
                    amount_to_liquidate = min(abs(net), units * price)
                    units_to_sell = amount_to_liquidate / price
                    units -= units_to_sell
                    cash  += amount_to_liquidate

                next_ev = next(ev_iter, None)

            portfolio_value = (units * price if price else 0.0) + cash
            records.append({
                "date":            d,
                "units":           units,
                "cash":            cash,
                "price":           price or 0.0,
                "portfolio_value": portfolio_value,
            })

        return pd.DataFrame(records)


# ══════════════════════════════════════════════════════════════════════════════
# 2. BehavioralAdjuster
# ══════════════════════════════════════════════════════════════════════════════

class BehavioralAdjuster:
    """
    Applies the user's behavioral fingerprint (BTF) to a replayed NAV series.

    Simulates:
      - Panic exits when drawdown exceeds the user's observed threshold
      - Re-entry after being out of the market (based on buy_dip_probability)
      - Cash drag during out-of-market periods
    """

    def adjust(
        self,
        nav: pd.DataFrame,       # output of CashFlowReplayer.replay()
        profile: dict[str, Any],
        prices: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Return adjusted NAV DataFrame with 'adjusted_value' column.
        The original 'portfolio_value' (perfect hold) is preserved for comparison.
        """
        panic_p10 = float(profile.get("panic_sell_probability_10") or 0.0)
        panic_p20 = float(profile.get("panic_sell_probability_20") or 0.0)
        buy_dip   = float(profile.get("buy_dip_probability") or 0.5)
        # Avg days before re-entry when not in market
        avg_days_between = float(profile.get("avg_days_between_trades") or 30)

        price_map = {row.date: float(row.adj_close) for row in prices.itertuples(index=False)}

        in_market    = True
        out_since    = None
        adj_units    = 0.0
        adj_cash     = 0.0
        peak_nav     = 0.0
        adj_records  = []

        # Seed initial position from the first row
        if not nav.empty:
            first = nav.iloc[0]
            adj_units = float(first["units"])
            adj_cash  = float(first["cash"])
            peak_nav  = float(first["portfolio_value"])

        for row in nav.itertuples(index=False):
            d     = row.date
            price = price_map.get(d, row.price)
            adj_nav = adj_units * price + adj_cash

            if adj_nav > peak_nav:
                peak_nav = adj_nav

            drawdown_pct = (adj_nav - peak_nav) / peak_nav * 100 if peak_nav > 0 else 0.0

            if in_market:
                # Check for panic exit
                p_exit = 0.0
                if drawdown_pct <= -20:
                    p_exit = panic_p20
                elif drawdown_pct <= -10:
                    p_exit = panic_p10

                if p_exit > 0 and random.random() < p_exit:
                    # Sell everything — convert units to cash
                    adj_cash  += adj_units * price
                    adj_units  = 0.0
                    in_market  = False
                    out_since  = d
            else:
                # Check for re-entry
                days_out = (d - out_since).days if out_since else 0
                # Re-entry probability increases with time and dip severity
                p_reenter = buy_dip * min(1.0, days_out / max(avg_days_between, 1))
                if random.random() < p_reenter:
                    # Reinvest all cash
                    if price > 0:
                        adj_units  = adj_cash / price
                        adj_cash   = 0.0
                        in_market  = True
                        out_since  = None

            adj_nav = adj_units * price + adj_cash
            adj_records.append(adj_nav)

        result = nav.copy()
        result["adjusted_value"] = adj_records
        return result


# ══════════════════════════════════════════════════════════════════════════════
# 3. PerformanceEngine
# ══════════════════════════════════════════════════════════════════════════════

def compute_metrics(values: list[float], label: str = "") -> dict[str, Any]:
    """
    Compute a full set of risk/return metrics for a NAV time series.
    `values` is a list of daily portfolio values (absolute, not returns).
    """
    if len(values) < 2:
        return _empty_metrics(label)

    arr = np.array(values, dtype=float)
    daily_returns = np.diff(arr) / arr[:-1]
    daily_returns = daily_returns[np.isfinite(daily_returns)]

    if len(daily_returns) == 0:
        return _empty_metrics(label)

    total_return   = (arr[-1] - arr[0]) / arr[0] if arr[0] > 0 else 0.0
    n_years        = len(values) / TRADING_DAYS_PER_YEAR
    cagr           = ((arr[-1] / arr[0]) ** (1 / n_years) - 1) if arr[0] > 0 and n_years > 0 else 0.0
    volatility     = float(np.std(daily_returns)) * np.sqrt(TRADING_DAYS_PER_YEAR)
    daily_rf       = RISK_FREE_RATE / TRADING_DAYS_PER_YEAR
    excess_returns = daily_returns - daily_rf
    sharpe         = float(np.mean(excess_returns) / np.std(excess_returns)) * np.sqrt(TRADING_DAYS_PER_YEAR) if np.std(excess_returns) > 0 else 0.0
    downside       = daily_returns[daily_returns < daily_rf]
    sortino_denom  = float(np.std(downside)) * np.sqrt(TRADING_DAYS_PER_YEAR) if len(downside) > 0 else 0.0
    sortino        = float(np.mean(excess_returns)) * TRADING_DAYS_PER_YEAR / sortino_denom if sortino_denom > 0 else 0.0

    # Max drawdown
    running_max   = np.maximum.accumulate(arr)
    drawdowns     = (arr - running_max) / running_max
    max_drawdown  = float(np.min(drawdowns))

    # Calmar ratio
    calmar = cagr / abs(max_drawdown) if max_drawdown != 0 else 0.0

    # Value at Risk (95%, historical)
    var_95 = float(np.percentile(daily_returns, 5)) if len(daily_returns) >= 20 else 0.0

    # Win rate
    win_rate = float(np.sum(daily_returns > 0) / len(daily_returns))

    return {
        "label":        label,
        "total_return": round(total_return * 100, 4),
        "cagr":         round(cagr         * 100, 4),
        "volatility":   round(volatility   * 100, 4),
        "sharpe":       round(sharpe,             4),
        "sortino":      round(sortino,            4),
        "max_drawdown": round(max_drawdown  * 100, 4),
        "calmar":       round(calmar,             4),
        "var_95":       round(var_95        * 100, 4),
        "win_rate":     round(win_rate      * 100, 2),
        "start_value":  round(float(arr[0]),  2),
        "end_value":    round(float(arr[-1]), 2),
        "n_days":       len(values),
    }


def _empty_metrics(label: str) -> dict[str, Any]:
    return {k: (label if k == "label" else 0.0) for k in
            ["label","total_return","cagr","volatility","sharpe","sortino",
             "max_drawdown","calmar","var_95","win_rate","start_value","end_value","n_days"]}


# ══════════════════════════════════════════════════════════════════════════════
# 4. DecisionTreeBuilder  (Decision Impact Tree — DIT)
# ══════════════════════════════════════════════════════════════════════════════

def build_decision_tree(
    cash_flows:      list[dict[str, Any]],
    actual_nav:      list[float],
    alt_navs:        dict[str, list[float]],
    nav_dates:       list[date],
) -> dict[str, Any]:
    """
    Build a Decision Impact Tree from the user's real transaction history.

    Each cash-flow event is a node.  For each node, we compute:
      - actual_delta   : portfolio change on/after that date (actual)
      - alt_deltas     : same for each comparison asset
      - impact_score   : how much this decision changed the gap vs the best alternative

    Returns a dict with 'nodes' list and summary stats.
    """
    if not cash_flows or not actual_nav:
        return {"nodes": [], "total_nodes": 0}

    date_to_idx = {d: i for i, d in enumerate(nav_dates)}

    equity_flows = [
        cf for cf in sorted(cash_flows, key=lambda x: _parse_date(x["date"]))
        if cf.get("transaction_type") in ("buy", "sell")
        and cf.get("symbol")
    ]

    nodes: list[dict] = []

    for cf in equity_flows:
        event_date = _parse_date(cf["date"])
        idx = date_to_idx.get(event_date)
        if idx is None:
            # Find nearest date
            nearest = min(date_to_idx.keys(), key=lambda d: abs((d - event_date).days), default=None)
            idx = date_to_idx.get(nearest) if nearest else None
        if idx is None or idx + 30 >= len(actual_nav):
            continue

        # 30-day forward impact
        fwd_idx = min(idx + 30, len(actual_nav) - 1)
        actual_delta_30d = (actual_nav[fwd_idx] - actual_nav[idx]) / actual_nav[idx] * 100 if actual_nav[idx] > 0 else 0.0

        alt_deltas = {}
        for sym, alt_nav in alt_navs.items():
            if len(alt_nav) > fwd_idx and alt_nav[idx] > 0:
                alt_deltas[sym] = round((alt_nav[fwd_idx] - alt_nav[idx]) / alt_nav[idx] * 100, 4)

        # Impact score: how much did the user outperform/underperform alternatives at this moment
        best_alt_delta = max(alt_deltas.values()) if alt_deltas else 0.0
        impact_vs_best = actual_delta_30d - best_alt_delta

        nodes.append({
            "date":              event_date.isoformat(),
            "transaction_type":  cf["transaction_type"],
            "symbol":            cf["symbol"],
            "price":             cf.get("price"),
            "quantity":          cf.get("quantity"),
            "actual_delta_30d":  round(actual_delta_30d, 4),
            "alt_deltas_30d":    alt_deltas,
            "impact_score":      round(impact_vs_best, 4),
        })

    return {
        "nodes":       nodes,
        "total_nodes": len(nodes),
    }


# ══════════════════════════════════════════════════════════════════════════════
# 5. InflectionDetector
# ══════════════════════════════════════════════════════════════════════════════

def detect_inflection_points(
    decision_tree: dict[str, Any],
    top_n: int = 5,
) -> list[dict[str, Any]]:
    """Return the top_n nodes ranked by absolute impact_score."""
    nodes = decision_tree.get("nodes", [])
    ranked = sorted(nodes, key=lambda n: abs(n.get("impact_score", 0)), reverse=True)
    return ranked[:top_n]


# ══════════════════════════════════════════════════════════════════════════════
# 6. TOICalculator  (Temporal Opportunity Index)
# ══════════════════════════════════════════════════════════════════════════════

def compute_toi(
    actual_metrics:  dict[str, Any],
    alt_metrics:     dict[str, dict[str, Any]],
    monthly_savings: float = 1000.0,
) -> dict[str, Any]:
    """
    Compute the Temporal Opportunity Index.

    For each alternative asset that outperformed:
      - dollar_gap            : end value difference ($)
      - months_to_recover     : months at `monthly_savings` to close the gap
      - pct_gap               : return difference (%)
      - correlation_adj_gap   : (not computed here — needs price correlation data;
                                 placeholder for the full implementation)
    """
    actual_end = actual_metrics.get("end_value", 0)
    results: dict[str, Any] = {}

    best_alt   = None
    best_gap   = 0.0

    for sym, alt in alt_metrics.items():
        alt_end = alt.get("end_value", 0)
        gap     = alt_end - actual_end
        pct_gap = alt.get("total_return", 0) - actual_metrics.get("total_return", 0)

        months_to_recover = (gap / monthly_savings) if (gap > 0 and monthly_savings > 0) else 0.0

        results[sym] = {
            "dollar_gap":         round(gap, 2),
            "pct_gap":            round(pct_gap, 4),
            "months_to_recover":  round(months_to_recover, 1),
            "outperformed":       gap > 0,
        }

        if gap > best_gap:
            best_gap = gap
            best_alt = sym

    return {
        "monthly_savings_assumption": monthly_savings,
        "best_alternative":           best_alt,
        "best_dollar_gap":            round(best_gap, 2),
        "alternatives":               results,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 7. MonteCarloEngine
# ══════════════════════════════════════════════════════════════════════════════

def run_monte_carlo(
    historical_returns: list[float],
    start_value:        float,
    n_days:             int,
    n_simulations:      int = 1000,
) -> dict[str, list[float]]:
    """
    Bootstrap Monte Carlo: resample historical daily returns with replacement
    and project `n_simulations` paths of `n_days` length.

    Returns percentile fan data: {p10, p25, p50, p75, p90} — each a list of
    daily portfolio values of length n_days.
    """
    if not historical_returns or start_value <= 0 or n_days <= 0:
        empty = [start_value] * n_days
        return {"p10": empty, "p25": empty, "p50": empty, "p75": empty, "p90": empty}

    ret_arr   = np.array(historical_returns, dtype=float)
    paths     = np.empty((n_simulations, n_days), dtype=float)

    for i in range(n_simulations):
        sampled = np.random.choice(ret_arr, size=n_days, replace=True)
        path    = [start_value]
        for r in sampled:
            path.append(path[-1] * (1 + r))
        paths[i] = path[1:]

    return {
        "p10": np.percentile(paths, 10, axis=0).round(2).tolist(),
        "p25": np.percentile(paths, 25, axis=0).round(2).tolist(),
        "p50": np.percentile(paths, 50, axis=0).round(2).tolist(),
        "p75": np.percentile(paths, 75, axis=0).round(2).tolist(),
        "p90": np.percentile(paths, 90, axis=0).round(2).tolist(),
    }


# ── Utilities ─────────────────────────────────────────────────────────────────

def _parse_date(d: Any) -> date:
    if isinstance(d, date):
        return d
    if isinstance(d, str):
        return date.fromisoformat(d[:10])
    raise ValueError(f"Cannot parse date: {d!r}")


def build_timeseries(
    nav_dates:    list[date],
    actual_nav:   list[float],
    alt_navs:     dict[str, list[float]],
    adj_navs:     dict[str, list[float]],
    sample_every: int = 5,      # thin to ~1 row per week to keep payload small
) -> list[dict[str, Any]]:
    """
    Build the timeseries array for the scenario_results JSONB field.
    Each element: {date, actual, <symbol>_perfect, <symbol>_realistic, ...}
    """
    rows: list[dict] = []
    for i, (d, actual) in enumerate(zip(nav_dates, actual_nav)):
        if i % sample_every != 0 and i != len(nav_dates) - 1:
            continue
        row: dict[str, Any] = {
            "date":   d.isoformat(),
            "actual": round(actual, 2),
        }
        for sym, alt in alt_navs.items():
            if i < len(alt):
                row[f"{sym}_perfect"] = round(alt[i], 2)
        for sym, adj in adj_navs.items():
            if i < len(adj):
                row[f"{sym}_realistic"] = round(adj[i], 2)
        rows.append(row)
    return rows
