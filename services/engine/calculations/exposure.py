"""
Portfolio exposure analysis: asset class, sector, geography, concentration.

Inputs are lists of holding dicts straight from the Supabase query layer.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any


# ── Type alias ────────────────────────────────────────────────────────────────
Holding = dict[str, Any]


# ── Asset class exposure ──────────────────────────────────────────────────────
def compute_asset_class_exposure(
    holdings: list[Holding],
    cash_value: float = 0.0,
) -> list[dict]:
    """
    Break down portfolio market value by asset class.

    Holdings must have keys: symbol, asset_class, market_value, currency.
    Returns list of {asset_class, market_value, allocation_pct, position_count}.
    """
    buckets: dict[str, dict] = defaultdict(
        lambda: {"market_value": 0.0, "position_count": 0}
    )

    total = sum(h.get("market_value", 0) or 0 for h in holdings) + cash_value

    for h in holdings:
        ac = h.get("asset_class") or "unknown"
        mv = float(h.get("market_value", 0) or 0)
        buckets[ac]["market_value"] += mv
        buckets[ac]["position_count"] += 1

    if cash_value > 0:
        buckets["cash"]["market_value"] += cash_value

    result = []
    for ac, data in buckets.items():
        mv = data["market_value"]
        result.append({
            "asset_class":     ac,
            "market_value":    round(mv, 2),
            "allocation_pct":  round(mv / total * 100, 2) if total > 0 else 0.0,
            "position_count":  data["position_count"],
        })

    return sorted(result, key=lambda x: x["market_value"], reverse=True)


# ── Sector exposure ───────────────────────────────────────────────────────────
def compute_sector_exposure(holdings: list[Holding]) -> list[dict]:
    """
    Break down portfolio by GICS sector.
    Holdings with no sector are grouped as 'Unknown'.
    """
    buckets: dict[str, float] = defaultdict(float)
    total = sum(float(h.get("market_value", 0) or 0) for h in holdings)

    for h in holdings:
        sector = h.get("sector") or "Unknown"
        mv = float(h.get("market_value", 0) or 0)
        buckets[sector] += mv

    return sorted(
        [
            {
                "sector":         sector,
                "market_value":   round(mv, 2),
                "allocation_pct": round(mv / total * 100, 2) if total > 0 else 0.0,
            }
            for sector, mv in buckets.items()
        ],
        key=lambda x: x["market_value"],
        reverse=True,
    )


# ── Currency exposure ─────────────────────────────────────────────────────────
def compute_currency_exposure(holdings: list[Holding]) -> list[dict]:
    """Break down by denomination currency."""
    buckets: dict[str, float] = defaultdict(float)
    total = sum(float(h.get("market_value", 0) or 0) for h in holdings)

    for h in holdings:
        currency = (h.get("currency") or "USD").upper()
        mv = float(h.get("market_value", 0) or 0)
        buckets[currency] += mv

    return sorted(
        [
            {
                "currency":       currency,
                "market_value":   round(mv, 2),
                "allocation_pct": round(mv / total * 100, 2) if total > 0 else 0.0,
            }
            for currency, mv in buckets.items()
        ],
        key=lambda x: x["market_value"],
        reverse=True,
    )


# ── Concentration risk ────────────────────────────────────────────────────────
def compute_concentration_risk(
    holdings: list[Holding],
    total_value: float,
) -> dict:
    """
    Measures how concentrated the portfolio is.

    Metrics returned:
      top_10_pct       – % of portfolio in the 10 largest positions
      top_3_pct        – % in the 3 largest positions
      herfindahl_index – HHI: sum of squared weight fractions (0–1)
                         < 0.10  → diversified
                         0.10–0.25 → moderate concentration
                         > 0.25  → concentrated
      effective_n      – 1 / HHI — the "effective number of equal positions"
      largest_position – symbol and allocation_pct of the biggest single holding
    """
    if not holdings or total_value <= 0:
        return {
            "top_10_pct":       0.0,
            "top_3_pct":        0.0,
            "herfindahl_index": 0.0,
            "effective_n":      0,
            "largest_position": None,
        }

    sorted_h = sorted(
        holdings,
        key=lambda h: float(h.get("market_value", 0) or 0),
        reverse=True,
    )

    weights = [
        float(h.get("market_value", 0) or 0) / total_value
        for h in sorted_h
    ]

    top3_pct  = round(sum(weights[:3])  * 100, 2)
    top10_pct = round(sum(weights[:10]) * 100, 2)
    hhi       = round(sum(w ** 2 for w in weights), 4)
    eff_n     = round(1 / hhi) if hhi > 0 else 0

    largest = sorted_h[0] if sorted_h else None

    return {
        "top_10_pct":       top10_pct,
        "top_3_pct":        top3_pct,
        "herfindahl_index": hhi,
        "effective_n":      eff_n,
        "largest_position": {
            "symbol":         largest.get("symbol"),
            "allocation_pct": round(weights[0] * 100, 2),
            "market_value":   round(float(largest.get("market_value", 0) or 0), 2),
        } if largest else None,
    }


# ── Full exposure report ──────────────────────────────────────────────────────
def build_exposure_report(
    holdings: list[Holding],
    total_value: float,
    cash_value: float,
) -> dict:
    """
    Aggregates all exposure sub-reports into one dict.
    This is what the /portfolio/exposure endpoint returns.
    """
    return {
        "by_asset_class":   compute_asset_class_exposure(holdings, cash_value),
        "by_sector":        compute_sector_exposure(holdings),
        "by_currency":      compute_currency_exposure(holdings),
        "concentration":    compute_concentration_risk(holdings, total_value),
        "position_count":   len(holdings),
        "total_value":      round(total_value, 2),
        "cash_value":       round(cash_value, 2),
        "invested_value":   round(total_value - cash_value, 2),
        "cash_pct":         round(cash_value / total_value * 100, 2) if total_value > 0 else 0.0,
    }
