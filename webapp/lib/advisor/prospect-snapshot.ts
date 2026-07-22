import type { Diagnostic } from "@/components/advisor/diagnostic-report";

/**
 * Bump this whenever buildProspectSnapshot's selection logic changes in a way
 * that would alter what's shown (e.g. picking a different number of top
 * insights). Existing snapshots are never recomputed against a new version —
 * this is purely a label carried alongside each frozen snapshot so a past
 * share link's provenance is traceable if ever questioned.
 */
export const REPORT_TEMPLATE_VERSION = "v1";

/**
 * Freezes exactly the subset of a diagnostic the prospect-facing report is
 * allowed to show, computed ONCE at save time — not re-derived on every view.
 *
 * Two guarantees this buys:
 *
 *   1. Compliance integrity. What a prospect saw stays fixed forever, even if
 *      the app's rendering/selection logic changes later (e.g. which insights
 *      get surfaced, or how many). Reopening a share link months from now
 *      reproduces the exact document that was actually shared — not a
 *      recomputation under today's code.
 *
 *   2. Data minimization. risk_suite, behavioral_v2, tax_analysis, statistics,
 *      and score subscores are never PRESENT in the returned object at all —
 *      not filtered by a UI mode switch, absent from the payload. A tampered
 *      or malicious client reading the public share API has nothing to
 *      extract, because it was never sent.
 */
export function buildProspectSnapshot(d: Diagnostic): Diagnostic {
  return {
    firm_name:         d.firm_name,
    client_label:      d.client_label,
    analysis_date:     d.analysis_date,
    transaction_count: d.transaction_count,
    period_start:      d.period_start,
    period_end:        d.period_end,

    mwr_annualized:         d.mwr_annualized,
    behavioral_tax_pct:     d.behavioral_tax_pct,
    panic_liquidation_rate: d.panic_liquidation_rate,
    trade_win_rate:         d.trade_win_rate,

    grades:      d.grades,
    insights:    d.insights.slice(0, 3),
    wealth_path: d.wealth_path,

    currency:                  d.currency,
    estimated_portfolio_value: d.estimated_portfolio_value ?? null,
    live_price_coverage:       d.live_price_coverage ?? null,
    benchmark_symbol:          d.benchmark_symbol ?? null,
    benchmark_end_value:       d.benchmark_end_value ?? null,
    benchmark_mwr_annualized:  d.benchmark_mwr_annualized ?? null,
    alpha_vs_benchmark_pp:     d.alpha_vs_benchmark_pp ?? null,
    opportunity_cost_dollars:  d.opportunity_cost_dollars ?? null,

    projection: d.projection ?? null,
    narrative:  d.narrative ?? null,

    score_v2: d.score_v2
      ? { composite: d.score_v2.composite, grade: d.score_v2.grade, subscores: {}, weights_used: {} }
      : null,

    // Deliberately absent — see the guarantee above. Explicit nulls, not
    // omitted keys, so a consumer checking `!= null` behaves predictably.
    risk_suite:    null,
    behavioral_v2: null,
    tax_analysis:  null,
    statistics:    null,
  };
}
