"""
Tax drag analysis (Phase 6) — holding-period tax efficiency.

Australia (AUD): capital gains on assets held ≥ 12 months receive a 50% CGT
discount. Selling a winner at month 11 instead of month 13 doubles the taxable
gain — a pure, quantifiable cost of impatience. This module measures it.

United States (USD): the analogous boundary is the long-term capital gains
rate at 12 months; the same short/long split applies with different framing.

Method:
  - FIFO lot matching with dates and dollar amounts (independent of the
    return-based matcher in the router, which discards quantities).
  - Every realized gain is classified short (< 365 days) or long.
  - Forgone benefit = short-term positive gains × marginal_rate × discount,
    i.e. the tax that would have been saved had each winner crossed the
    12-month line before sale.
  - "Near-miss" sales — winners sold between months 9 and 12 — are counted
    separately: they are the cheapest behavior to fix.

Assumed marginal rate defaults to 37% (AU $135k–190k bracket, FY2025-26,
ex-Medicare). Stated on the report; adjustable per client later.
"""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Optional, TypedDict

_DISCOUNT = {"AUD": 0.50, "USD": 0.50}     # AU CGT discount / US LT-vs-ST proxy
_DEFAULT_MARGINAL_RATE = 0.37
_LONG_TERM_DAYS = 365
_NEAR_MISS_MIN_DAYS = 270                  # 9 months


class TaxDragResult(TypedDict):
    currency:                  str
    marginal_rate_assumed:     float
    short_term_gain:           float   # realized on lots held < 12 months
    long_term_gain:            float
    short_term_loss:           float
    pct_gains_taken_early:     Optional[float]  # short gains / all positive gains
    est_discount_forgone:      float   # extra tax paid by selling early
    near_miss_sales:           int     # winners sold at 9–12 months
    near_miss_gain:            float
    avg_hold_winners_days:     Optional[float]
    avg_hold_losers_days:      Optional[float]


def compute_tax_drag(
    trades: list[dict],                    # router-normalized, sorted, with _date
    currency: str = "AUD",
    marginal_rate: float = _DEFAULT_MARGINAL_RATE,
) -> Optional[TaxDragResult]:
    lots: dict[str, deque] = defaultdict(deque)   # symbol → [qty, price, date]

    st_gain = lt_gain = st_loss = 0.0
    near_miss_n = 0
    near_miss_gain = 0.0
    win_holds: list[int] = []
    loss_holds: list[int] = []

    for t in sorted(trades, key=lambda x: x["_date"]):
        sym = t["symbol"]
        if t["transaction_type"] == "buy":
            lots[sym].append([t["quantity"], t["price"], t["_date"]])
            continue
        if t["transaction_type"] != "sell":
            continue

        remaining = t["quantity"]
        q = lots[sym]
        while remaining > 1e-9 and q:
            lot = q[0]
            take = min(lot[0], remaining)
            hold_days = (t["_date"] - lot[2]).days
            gain = (t["price"] - lot[1]) * take

            if gain > 0:
                win_holds.append(hold_days)
                if hold_days < _LONG_TERM_DAYS:
                    st_gain += gain
                    if hold_days >= _NEAR_MISS_MIN_DAYS:
                        near_miss_n += 1
                        near_miss_gain += gain
                else:
                    lt_gain += gain
            elif gain < 0:
                loss_holds.append(hold_days)
                if hold_days < _LONG_TERM_DAYS:
                    st_loss += -gain

            lot[0] -= take
            remaining -= take
            if lot[0] <= 1e-9:
                q.popleft()

    if not win_holds and not loss_holds:
        return None                                   # nothing realized → no story

    discount = _DISCOUNT.get(currency, 0.50)
    total_pos = st_gain + lt_gain

    return TaxDragResult(
        currency=currency,
        marginal_rate_assumed=marginal_rate,
        short_term_gain=round(st_gain, 2),
        long_term_gain=round(lt_gain, 2),
        short_term_loss=round(st_loss, 2),
        pct_gains_taken_early=round(st_gain / total_pos * 100, 2) if total_pos > 0 else None,
        est_discount_forgone=round(st_gain * marginal_rate * discount, 2),
        near_miss_sales=near_miss_n,
        near_miss_gain=round(near_miss_gain, 2),
        avg_hold_winners_days=round(sum(win_holds) / len(win_holds), 1) if win_holds else None,
        avg_hold_losers_days=round(sum(loss_holds) / len(loss_holds), 1) if loss_holds else None,
    )
