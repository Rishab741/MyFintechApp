"""
Narrative engine (Phase 9) — the executive summary an advisor reads aloud.

Three paragraphs, deterministic, composed only from metrics that exist:
  1. PERFORMANCE — return, benchmark comparison, opportunity cost in dollars.
  2. BEHAVIOR    — the two or three strongest behavioral findings, by severity.
  3. PATH        — what changes, and what the projection says it is worth.

Tone rules: numbers over adjectives; no blame language (the prospect is in the
room); every claim traceable to a metric on the report.
"""

from __future__ import annotations

from typing import Optional


def _money(v: float, ccy: str) -> str:
    sym = "A$" if ccy == "AUD" else "$"
    a = abs(v)
    if a >= 1_000_000:
        return f"{sym}{a/1_000_000:.2f}M"
    if a >= 1_000:
        return f"{sym}{a/1_000:.0f}K"
    return f"{sym}{a:,.0f}"


def build_narrative(
    *,
    currency: str,
    period_start: str,
    period_end: str,
    transaction_count: int,
    mwr_pct: float,
    est_value: Optional[float],
    benchmark: Optional[dict],          # replay result
    risk: Optional[dict],               # risk suite
    bv2: Optional[dict],                # behavioral v2
    tax: Optional[dict],                # tax drag
    stats: Optional[dict],              # statistical summary
    projection: Optional[dict],
) -> list[str]:
    paras: list[str] = []

    # ── 1. Performance ─────────────────────────────────────────────────────────
    p1 = (
        f"Across {transaction_count} transactions from {period_start} to {period_end}, "
        f"this portfolio produced a money-weighted return of {mwr_pct:+.1f}% per year"
    )
    if risk and risk.get("volatility_pct") is not None:
        p1 += f" with annualized volatility of {risk['volatility_pct']:.0f}%"
        if risk.get("max_drawdown_pct") is not None:
            p1 += f" and a maximum drawdown of {risk['max_drawdown_pct']:.0f}%"
    p1 += ". "
    if benchmark and est_value:
        gap = benchmark["opportunity_cost_dollars"]
        if gap > 0:
            p1 += (
                f"The same deposits made into {benchmark['benchmark_symbol']} on the same "
                f"dates would be worth {_money(benchmark['benchmark_end_value'], currency)} today "
                f"against the portfolio's {_money(est_value, currency)} — a gap of "
                f"{_money(gap, currency)}, equivalent to "
                f"{abs(benchmark['alpha_pp']):.1f} percentage points per year."
            )
        else:
            p1 += (
                f"The portfolio is ahead of a {benchmark['benchmark_symbol']} index replay by "
                f"{_money(-gap, currency)} ({benchmark['alpha_pp']:+.1f} pp per year) — "
                f"the analysis below examines whether that edge is repeatable."
            )
    paras.append(p1)

    # ── 2. Behavior — strongest findings first ─────────────────────────────────
    findings: list[tuple[float, str]] = []       # (severity, sentence)
    if bv2:
        dr = bv2.get("disposition_ratio")
        if dr is not None and dr > 1.1:
            # Severity: excess over parity ×5, so 1.8× ranks alongside a 40%
            # panic rate rather than below a mild FOMO reading.
            findings.append(((dr - 1.0) * 5.0, (
                f"Winners are sold at {dr:.1f}× the rate that losers are — the disposition "
                f"effect, which systematically converts temporary paper losses into permanent ones."
            )))
        mp = bv2.get("market_panic_sell_pct")
        if mp is not None and mp > 15:
            findings.append((mp / 10, (
                f"{mp:.0f}% of all sell orders were executed while the index was more than 10% "
                f"below its peak — selling into market-wide drawdowns rather than through them."
            )))
        fomo = bv2.get("fomo_index_pct")
        if fomo is not None and fomo > 3:
            findings.append((fomo / 3, (
                f"Purchases followed an average {fomo:.1f}% price run-up over the prior month, "
                f"a pattern of buying strength and paying peak prices."
            )))
        to = bv2.get("annual_turnover_x")
        if to is not None and to > 1.5:
            findings.append((to / 2, (
                f"Annual turnover of {to:.1f}× means the portfolio is effectively rebuilt "
                f"every {12/to:.0f} months, compounding transaction and tax friction."
            )))
    if tax and tax.get("est_discount_forgone", 0) >= 500:
        findings.append((tax["est_discount_forgone"] / 1000, (
            f"{tax['pct_gains_taken_early']:.0f}% of realized gains were taken inside twelve "
            f"months, forfeiting an estimated {_money(tax['est_discount_forgone'], currency)} "
            f"in tax that patience alone would have saved."
        )))

    if findings:
        findings.sort(key=lambda x: -x[0])
        p2 = "The behavioral record shows where returns leaked. " + " ".join(s for _, s in findings[:3])
        if stats and stats.get("confidence") == "low":
            p2 += (
                f" (Sample size is {stats['sample_pairs']} closed trades; treat point "
                f"estimates as indicative rather than precise.)"
            )
        paras.append(p2)

    # ── 3. Path forward ────────────────────────────────────────────────────────
    if projection:
        gap = projection["terminal_gap_p50"]
        yrs = projection["horizon_years"]
        if gap > 0:
            p3 = (
                f"Projected forward {yrs} years at each regime's own return and risk "
                f"parameters, the median outcome of a disciplined, index-anchored strategy "
                f"exceeds the current trajectory by {_money(gap, currency)}. "
                f"That differential is not market risk — both projections carry it — "
                f"it is the compounded price of the behaviors identified above, "
                f"and it is recoverable."
            )
        else:
            p3 = (
                f"Projected forward {yrs} years, the current approach's median outcome "
                f"holds its own against a disciplined benchmark strategy. The findings "
                f"above indicate where its risk profile can be tightened without "
                f"surrendering that edge."
            )
        paras.append(p3)

    return paras
