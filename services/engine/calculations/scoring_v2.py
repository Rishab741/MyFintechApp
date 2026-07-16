"""
Composite scoring engine v2 (Phase 8).

Replaces the heuristic A–F with a weighted 0–100 composite over six documented
sub-scores. Every mapping is explicit and monotonic; missing inputs cause the
component to be EXCLUDED and the remaining weights renormalized, rather than
silently defaulting — a component the data can't support shouldn't move the
grade in either direction.

Weights (of 100): alpha 25 · discipline 20 · timing 15 · tax 15 · turnover 15
· diversification 10.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Optional, TypedDict

_WEIGHTS = {
    "alpha":           25.0,
    "discipline":      20.0,
    "timing":          15.0,
    "tax_efficiency":  15.0,
    "turnover":        15.0,
    "diversification": 10.0,
}


def _lin(v: float, lo: float, hi: float) -> float:
    """Map v from [lo, hi] to [0, 100], clamped."""
    if hi == lo:
        return 50.0
    return max(0.0, min(100.0, (v - lo) / (hi - lo) * 100.0))


class ScoreV2(TypedDict):
    composite:     float
    grade:         str
    subscores:     dict          # name → 0–100 (only components with data)
    weights_used:  dict          # name → renormalized weight


def _letter(score: float) -> str:
    if score >= 85: return "A"
    if score >= 70: return "B"
    if score >= 55: return "C"
    if score >= 40: return "D"
    return "F"


def compute_score_v2(
    alpha_pp:              Optional[float],   # client − benchmark, pp/yr
    panic_rate_pct:        float,             # position-level panic sells
    market_panic_pct:      Optional[float],   # sells during index drawdowns
    timing_quality:        float,             # −1 … +1
    fomo_index_pct:        Optional[float],
    pct_gains_taken_early: Optional[float],
    annual_turnover_x:     Optional[float],
    trades:                list[dict],
) -> ScoreV2:
    subs: dict[str, float] = {}

    # ── Alpha: −10pp → 0, +5pp → 100 (0pp lands at 67 — matching is good) ─────
    if alpha_pp is not None:
        subs["alpha"] = round(_lin(alpha_pp, -10.0, 5.0), 1)

    # ── Discipline: blend position-panic and market-panic ─────────────────────
    d = _lin(-panic_rate_pct, -100.0, 0.0)              # 0% panic → 100
    if market_panic_pct is not None:
        d = 0.5 * d + 0.5 * _lin(-market_panic_pct, -100.0, 0.0)
    subs["discipline"] = round(d, 1)

    # ── Timing: quality score, penalized by rally-chasing ─────────────────────
    t = _lin(timing_quality, -1.0, 1.0)
    if fomo_index_pct is not None:
        t -= max(0.0, fomo_index_pct - 3.0) * 2.0       # >3% avg run-up penalized
    subs["timing"] = round(max(0.0, min(100.0, t)), 1)

    # ── Tax efficiency: 0% early gains → 100, 100% early → 0 ─────────────────
    if pct_gains_taken_early is not None:
        subs["tax_efficiency"] = round(_lin(-pct_gains_taken_early, -100.0, 0.0), 1)

    # ── Turnover: ≤0.5x → 100, ≥5x → 0 ────────────────────────────────────────
    if annual_turnover_x is not None:
        subs["turnover"] = round(_lin(-(annual_turnover_x), -5.0, -0.5), 1)

    # ── Diversification: effective N from buy-notional HHI ───────────────────
    notional: dict[str, float] = defaultdict(float)
    for t_ in trades:
        if t_["transaction_type"] == "buy":
            notional[t_["symbol"]] += t_["price"] * t_["quantity"]
    total = sum(notional.values())
    if total > 0 and len(notional) >= 1:
        hhi = sum((v / total) ** 2 for v in notional.values())
        effective_n = 1.0 / hhi
        subs["diversification"] = round(_lin(effective_n, 1.0, 12.0), 1)

    # ── Composite with renormalized weights ──────────────────────────────────
    used = {k: _WEIGHTS[k] for k in subs}
    wsum = sum(used.values())
    weights_used = {k: round(w / wsum * 100.0, 1) for k, w in used.items()}
    composite = sum(subs[k] * used[k] for k in subs) / wsum if wsum else 0.0

    return ScoreV2(
        composite=round(composite, 1),
        grade=_letter(composite),
        subscores=subs,
        weights_used=weights_used,
    )
