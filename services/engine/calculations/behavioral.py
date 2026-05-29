"""
Behavioral Transaction Fingerprinting (BTF)

Derives a user's behavioral investment profile from their actual transaction
history — no questionnaire required.  The profile is used by the simulation
layer to apply realistic behavioral adjustments to counterfactual scenarios.

Key metrics extracted:
  - avg_holding_days           : how long they typically hold before selling
  - panic_sell_probability_10  : P(sell | portfolio down ≥ 10 %)
  - panic_sell_probability_20  : P(sell | portfolio down ≥ 20 %)
  - buy_dip_probability        : P(buy  | market down ≥ 10 % from recent peak)
  - loss_aversion_score        : asymmetry in holding losing vs winning positions
  - timing_quality_score       : were buys cheap and sells expensive? [-1, +1]
"""

from __future__ import annotations

import logging
from datetime import date
from statistics import mean, median
from typing import Any

import numpy as np

log = logging.getLogger("engine.behavioral")

# Minimum transactions for a reliable profile
MIN_TX_FOR_LOW        = 5
MIN_TX_FOR_MEDIUM     = 20
MIN_TX_FOR_HIGH       = 50


def build_profile(transactions: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Build a behavioral profile dict from a list of transaction records.

    Each transaction must have:
      - transaction_type : 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdrawal'
      - date             : ISO date string
      - symbol           : ticker (may be None for cash transactions)
      - quantity         : float
      - price            : float (execution price)
      - net_amount       : float (signed — negative = cash out for buys)

    Returns a dict matching the behavioral_profiles table columns.
    """
    # Filter to equity trades only
    trades = [
        t for t in transactions
        if t.get("transaction_type") in ("buy", "sell")
        and t.get("symbol")
        and t.get("price", 0) > 0
        and t.get("quantity", 0) > 0
    ]

    n = len(trades)
    confidence = _confidence_label(n)

    if n < MIN_TX_FOR_LOW:
        return _empty_profile(n, confidence)

    # Parse dates
    for t in trades:
        if isinstance(t.get("date"), str):
            t["_date"] = date.fromisoformat(t["date"][:10])
        else:
            t["_date"] = t["date"]

    buys  = [t for t in trades if t["transaction_type"] == "buy"]
    sells = [t for t in trades if t["transaction_type"] == "sell"]

    holding_days      = _compute_holding_days(buys, sells)
    timing_score      = _compute_timing_quality(buys, sells)
    loss_aversion     = _compute_loss_aversion(buys, sells)
    exit_drawdowns    = _compute_exit_drawdowns(sells, trades)
    trade_dates       = sorted(set(t["_date"] for t in trades))
    inter_trade_gaps  = _inter_trade_gaps(trade_dates)
    concentration     = _position_concentration(buys, sells)
    buy_dip_prob      = _buy_dip_probability(buys, trades)
    panic_10, panic_20 = _panic_sell_probabilities(sells, trades)

    return {
        "transaction_count":          n,
        "profile_confidence":         confidence,
        "avg_holding_days":           round(mean(holding_days), 2)   if holding_days   else None,
        "median_holding_days":        round(median(holding_days), 2) if holding_days   else None,
        "max_holding_days":           round(max(holding_days), 2)    if holding_days   else None,
        "avg_exit_drawdown_pct":      round(mean(exit_drawdowns), 4) if exit_drawdowns else None,
        "panic_sell_probability_10":  round(panic_10, 4),
        "panic_sell_probability_20":  round(panic_20, 4),
        "buy_dip_probability":        round(buy_dip_prob, 4),
        "avg_days_between_trades":    round(mean(inter_trade_gaps), 2) if inter_trade_gaps else None,
        "avg_position_size_pct":      round(concentration["avg_pct"], 4),
        "max_position_concentration": round(concentration["max_pct"], 4),
        "loss_aversion_score":        round(loss_aversion, 4),
        "timing_quality_score":       round(timing_score, 4),
        "concentration_score":        round(concentration["concentration"], 4),
    }


# ── Metric computers ──────────────────────────────────────────────────────────

def _compute_holding_days(
    buys:  list[dict],
    sells: list[dict],
) -> list[float]:
    """Match buy→sell pairs per symbol using FIFO; return list of holding durations."""
    # Group buys and sells by symbol
    buy_queues:  dict[str, list[dict]] = {}
    sell_events: dict[str, list[dict]] = {}

    for b in sorted(buys, key=lambda x: x["_date"]):
        buy_queues.setdefault(b["symbol"], []).append(b)
    for s in sorted(sells, key=lambda x: x["_date"]):
        sell_events.setdefault(s["symbol"], []).append(s)

    durations: list[float] = []
    for symbol, sell_list in sell_events.items():
        queue = list(buy_queues.get(symbol, []))  # FIFO copy
        for sell in sell_list:
            if queue:
                buy = queue.pop(0)
                days = (sell["_date"] - buy["_date"]).days
                if 0 <= days <= 3650:  # cap at 10 years to remove data anomalies
                    durations.append(float(days))
    return durations


def _compute_timing_quality(
    buys:  list[dict],
    sells: list[dict],
) -> float:
    """
    Score timing quality on [-1, +1].
    +1 = buys were at relative lows, sells at relative highs.
    -1 = the opposite (classic panic-buyer).

    Approximation: compare each trade price to the mean price of same-symbol
    transactions ±30 days.  If buy < local_mean → good timing (+); vice versa.
    """
    all_trades = buys + sells
    if len(all_trades) < 4:
        return 0.0

    scores: list[float] = []
    for t in all_trades:
        symbol = t["symbol"]
        same_symbol = [x for x in all_trades if x["symbol"] == symbol]
        if len(same_symbol) < 2:
            continue

        prices = [x["price"] for x in same_symbol]
        local_mean = mean(prices)
        if local_mean == 0:
            continue

        deviation = (t["price"] - local_mean) / local_mean
        # Buys below mean are good (+), sells above mean are good (+)
        if t["transaction_type"] == "buy":
            scores.append(-deviation)   # negative deviation = bought cheap = good
        else:
            scores.append(deviation)    # positive deviation = sold high = good

    if not scores:
        return 0.0

    raw = mean(scores)
    # Clamp to [-1, +1]
    return max(-1.0, min(1.0, raw * 5.0))


def _compute_loss_aversion(
    buys:  list[dict],
    sells: list[dict],
) -> float:
    """
    Estimate loss aversion [0, 1] from asymmetry in holding period.
    Users with high loss aversion hold losing positions longer than winning ones.
    We approximate by comparing holding days for sells at a loss vs at a gain.
    Without cost-basis tracking here, we use a simpler proxy:
    high sell volume relative to buy count on down days = higher loss aversion.
    Falls back to 0.5 (neutral) when data is sparse.
    """
    if len(buys) < 3 or len(sells) < 3:
        return 0.5

    buy_dates  = sorted(t["_date"] for t in buys)
    sell_dates = sorted(t["_date"] for t in sells)

    # Proxy: compute ratio of sells that happen within 30 days of a buy
    # (short-term profit-taking = low loss aversion; long holds = high)
    quick_sells = 0
    for sell in sells:
        recent_buys = [b for b in buys
                       if 0 <= (sell["_date"] - b["_date"]).days <= 30
                       and b["symbol"] == sell["symbol"]]
        if recent_buys:
            quick_sells += 1

    quick_ratio = quick_sells / len(sells)
    # High quick-sell ratio → low loss aversion (0.2)
    # Low quick-sell ratio → high loss aversion (0.8)
    return round(0.8 - 0.6 * quick_ratio, 4)


def _compute_exit_drawdowns(
    sells:  list[dict],
    trades: list[dict],
) -> list[float]:
    """
    For each sell transaction, estimate the drawdown the user was sitting on
    relative to the highest price of that symbol in the preceding 90 days.
    Returns list of drawdown percentages (negative = selling at a loss).
    """
    drawdowns: list[float] = []

    for sell in sells:
        symbol = sell["symbol"]
        sell_date = sell["_date"]

        # Find buy prices for this symbol in the 90 days before the sell
        recent_buys = [
            t["price"] for t in trades
            if t["transaction_type"] == "buy"
            and t["symbol"] == symbol
            and 0 < (sell_date - t["_date"]).days <= 90
        ]
        if not recent_buys:
            continue

        peak_cost = max(recent_buys)
        if peak_cost > 0:
            drawdown = (sell["price"] - peak_cost) / peak_cost * 100
            drawdowns.append(drawdown)

    return drawdowns


def _inter_trade_gaps(trade_dates: list[date]) -> list[float]:
    if len(trade_dates) < 2:
        return []
    return [(trade_dates[i] - trade_dates[i-1]).days
            for i in range(1, len(trade_dates))]


def _position_concentration(
    buys:  list[dict],
    sells: list[dict],
) -> dict[str, float]:
    """Approximate position sizing as % of total deployed capital."""
    if not buys:
        return {"avg_pct": 0.0, "max_pct": 0.0, "concentration": 0.0}

    total_capital = sum(abs(b.get("net_amount", b["price"] * b["quantity"])) for b in buys)
    if total_capital == 0:
        return {"avg_pct": 0.0, "max_pct": 0.0, "concentration": 0.0}

    by_symbol: dict[str, float] = {}
    for b in buys:
        amt = abs(b.get("net_amount", b["price"] * b["quantity"]))
        by_symbol[b["symbol"]] = by_symbol.get(b["symbol"], 0.0) + amt

    pcts = [v / total_capital for v in by_symbol.values()]
    avg_pct = mean(pcts) if pcts else 0.0
    max_pct = max(pcts) if pcts else 0.0

    # Herfindahl-Hirschman Index as concentration score (0 = diversified, 1 = mono)
    hhi = sum(p ** 2 for p in pcts)

    return {"avg_pct": avg_pct, "max_pct": max_pct, "concentration": min(1.0, hhi)}


def _buy_dip_probability(
    buys:  list[dict],
    trades: list[dict],
) -> float:
    """
    Estimate P(buy | market is down ≥ 10 % from recent peak).
    Approximated using price momentum within the user's own trade history:
    if recent same-symbol prices were declining before a buy → dip-buy.
    """
    if len(buys) < 3:
        return 0.5

    dip_buys = 0
    for buy in buys:
        symbol = buy["symbol"]
        # Look for sell or buy events in the 60 days prior at a higher price
        prior = [
            t["price"] for t in trades
            if t["symbol"] == symbol
            and 0 < (buy["_date"] - t["_date"]).days <= 60
        ]
        if prior and max(prior) > buy["price"] * 1.05:
            dip_buys += 1

    return dip_buys / len(buys)


def _panic_sell_probabilities(
    sells:  list[dict],
    trades: list[dict],
) -> tuple[float, float]:
    """
    Estimate P(sell | asset down ≥ 10%) and P(sell | asset down ≥ 20%).
    Uses cost-basis approximation from preceding buys.
    """
    total_sells = len(sells)
    if total_sells == 0:
        return 0.0, 0.0

    panic_10 = 0
    panic_20 = 0
    eligible  = 0

    for sell in sells:
        symbol = sell["symbol"]
        prior_buys = [
            t["price"] for t in trades
            if t["transaction_type"] == "buy"
            and t["symbol"] == symbol
            and t["_date"] < sell["_date"]
        ]
        if not prior_buys:
            continue
        eligible += 1
        avg_cost = mean(prior_buys)
        if avg_cost > 0:
            drawdown = (sell["price"] - avg_cost) / avg_cost * 100
            if drawdown <= -10:
                panic_10 += 1
            if drawdown <= -20:
                panic_20 += 1

    if eligible == 0:
        return 0.0, 0.0

    return panic_10 / eligible, panic_20 / eligible


# ── Helpers ───────────────────────────────────────────────────────────────────

def _confidence_label(n: int) -> str:
    if n >= MIN_TX_FOR_HIGH:
        return "high"
    if n >= MIN_TX_FOR_MEDIUM:
        return "medium"
    if n >= MIN_TX_FOR_LOW:
        return "low"
    return "insufficient"


def _empty_profile(n: int, confidence: str) -> dict[str, Any]:
    return {
        "transaction_count":          n,
        "profile_confidence":         confidence,
        "avg_holding_days":           None,
        "median_holding_days":        None,
        "max_holding_days":           None,
        "avg_exit_drawdown_pct":      None,
        "panic_sell_probability_10":  0.0,
        "panic_sell_probability_20":  0.0,
        "buy_dip_probability":        0.5,
        "avg_days_between_trades":    None,
        "avg_position_size_pct":      0.0,
        "max_position_concentration": 0.0,
        "loss_aversion_score":        0.5,
        "timing_quality_score":       0.0,
        "concentration_score":        0.0,
    }
