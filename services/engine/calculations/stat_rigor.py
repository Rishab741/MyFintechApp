"""
Statistical rigor layer (Phase 5).

A diagnostic computed from 14 trades must not present itself with the same
authority as one computed from 400. This module quantifies that honestly:

  bootstrap_ci        — non-parametric confidence interval on any per-trade
                        metric (behavioral tax, realized return). Resamples
                        the trade set with replacement; no normality assumed.
  binomial_skill_test — one-sided exact test: probability of seeing at least
                        this many winners under pure coin-flip trading. A win
                        rate of 62% over 13 trades is chance (p≈0.29); over
                        130 trades it is skill (p≈0.004).
  confidence_label    — coarse sample-size label surfaced on the report.

Deterministic by construction (fixed RNG seed) so the same CSV always yields
the same report — a compliance requirement for advisor-facing documents.
"""

from __future__ import annotations

import math
import random
from typing import Optional, TypedDict

_BOOT_ITERATIONS = 2000
_SEED = 1337


def bootstrap_ci(
    values: list[float],
    ci: float = 0.95,
    iterations: int = _BOOT_ITERATIONS,
) -> Optional[tuple[float, float]]:
    """Percentile bootstrap CI of the mean. None below 5 observations."""
    n = len(values)
    if n < 5:
        return None
    rng = random.Random(_SEED)
    means = []
    for _ in range(iterations):
        sample = [values[rng.randrange(n)] for _ in range(n)]
        means.append(sum(sample) / n)
    means.sort()
    alpha = (1.0 - ci) / 2.0
    lo = means[int(alpha * iterations)]
    hi = means[min(iterations - 1, int((1.0 - alpha) * iterations))]
    return lo, hi


def binomial_skill_test(wins: int, total: int) -> Optional[float]:
    """One-sided exact p-value: P(X >= wins) under p=0.5. None below 5 trades."""
    if total < 5 or wins < 0 or wins > total:
        return None
    p = sum(math.comb(total, k) for k in range(wins, total + 1)) / (2 ** total)
    return p


def confidence_label(n_pairs: int) -> str:
    if n_pairs >= 100:
        return "high"
    if n_pairs >= 30:
        return "moderate"
    return "low"


class StatisticalSummary(TypedDict):
    sample_pairs:              int
    confidence:                str
    behavioral_tax_ci_low_pp:  Optional[float]
    behavioral_tax_ci_high_pp: Optional[float]
    realized_return_ci_low:    Optional[float]
    realized_return_ci_high:   Optional[float]
    win_rate_p_value:          Optional[float]
    win_rate_verdict:          Optional[str]


def summarize(
    realized_returns: list[float],           # per completed pair, fractional
    buy_hold_returns: list[float],           # matched buy-hold baseline per pair
) -> StatisticalSummary:
    n = len(realized_returns)

    # Behavioral tax CI: bootstrap the PAIRWISE difference — resampling the
    # two series independently would break the pairing and overstate variance.
    tax_diffs = [bh - r for r, bh in zip(realized_returns, buy_hold_returns)]
    tax_ci = bootstrap_ci(tax_diffs)
    ret_ci = bootstrap_ci(realized_returns)

    wins = sum(1 for r in realized_returns if r > 0)
    p = binomial_skill_test(wins, n)
    if p is None:
        verdict = None
    elif p < 0.05:
        verdict = "statistically significant — unlikely to be luck"
    elif p < 0.20:
        verdict = "suggestive, but not conclusive at this sample size"
    else:
        verdict = "indistinguishable from chance at this sample size"

    return StatisticalSummary(
        sample_pairs=n,
        confidence=confidence_label(n),
        behavioral_tax_ci_low_pp=round(tax_ci[0] * 100, 2) if tax_ci else None,
        behavioral_tax_ci_high_pp=round(tax_ci[1] * 100, 2) if tax_ci else None,
        realized_return_ci_low=round(ret_ci[0] * 100, 2) if ret_ci else None,
        realized_return_ci_high=round(ret_ci[1] * 100, 2) if ret_ci else None,
        win_rate_p_value=round(p, 4) if p is not None else None,
        win_rate_verdict=verdict,
    )
