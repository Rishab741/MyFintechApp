/**
 * Pure financial calculation functions.
 *
 * These are the same algorithms used in supabase/functions/ml-pipeline/index.ts.
 * They live here so they can be unit-tested with Jest (the edge function uses
 * Deno, which can't be tested with the Node/Jest toolchain).
 *
 * Rules:
 *   - No side effects, no I/O, no React Native imports.
 *   - Every function is deterministic: same input → same output.
 *   - Tests live in src/lib/__tests__/finance.test.ts.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HealthMetrics {
  sharpe:          number;
  alpha:           number;
  maxDrawdown:     number;  // negative, e.g. -15.3
  winRate:         number;  // 0–100
  var95:           number;  // negative, e.g. -2.1
  momentum5:       number;
  cashPct:         number;  // 0–100
  positionsCount:  number;
  annVol:          number;  // annualised volatility, e.g. 22.5
}

// ── Core statistics ────────────────────────────────────────────────────────────

/** Annualised Sharpe ratio from an array of daily return percentages. */
export function sharpeRatio(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const mean   = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const vari   = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
  const stddev = Math.sqrt(vari);
  return stddev === 0 ? 0 : (mean / stddev) * Math.sqrt(252);
}

/** Annualised volatility (standard deviation × √252) from daily return percentages. */
export function annualizedVol(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const mean   = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const vari   = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
  return Math.sqrt(vari) * Math.sqrt(252);
}

/** 95% Value at Risk: the 5th percentile of the daily returns distribution. */
export function var95(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;
  const sorted = [...dailyReturns].sort((a, b) => a - b);
  // Nearest-rank method: ceil(n * 0.05) - 1 gives the index of the 5th percentile.
  // Math.floor would land one position too high when n * 0.05 is a whole number
  // (e.g., n=20 → floor(1.0)=1 → index 1, but the 5th percentile is index 0).
  const idx = Math.max(0, Math.ceil(sorted.length * 0.05) - 1);
  return sorted[idx] ?? 0;
}

/** Percentage of days with non-negative returns. */
export function winRate(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;
  return (dailyReturns.filter(r => r >= 0).length / dailyReturns.length) * 100;
}

/**
 * Peak-to-trough maximum drawdown as a percentage of peak value.
 * Returns 0 for a monotonically increasing series, negative otherwise.
 * e.g. values [100, 120, 90, 110] → drawdown of −25% (120 → 90)
 */
export function maxDrawdown(values: number[]): number {
  if (values.length < 2) return 0;
  let peak     = values[0];
  let maxDD    = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? ((v - peak) / peak) * 100 : 0;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

/**
 * Drawdown at a specific index relative to the historical peak up to that point.
 * Used for per-snapshot drawdown in the feature row computation.
 */
export function drawdownAt(values: number[], idx: number): number {
  if (idx === 0) return 0;
  const peak = Math.max(...values.slice(0, idx + 1));
  return peak > 0 ? ((values[idx] - peak) / peak) * 100 : 0;
}

/** Rolling standard deviation over `window` elements ending at `idx`. */
export function rollingStd(values: number[], window: number, idx: number): number {
  if (idx < window - 1) return 0;
  const slice = values.slice(idx - window + 1, idx + 1);
  const mean  = slice.reduce((a, b) => a + b, 0) / slice.length;
  const vari  = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  return Math.sqrt(vari);
}

/** Sum of `window` consecutive returns ending at `idx`. */
export function momentum(returns: number[], idx: number, window: number): number {
  if (idx < window) return 0;
  return returns.slice(idx - window + 1, idx + 1).reduce((a, b) => a + b, 0);
}

// ── S&P 500 benchmark lookup ───────────────────────────────────────────────────

/**
 * Emergency floor used before the first refresh-benchmark-cache cron run.
 * Represents the S&P 500 level circa March 2025. Remove once price_cache is seeded.
 */
export const SP500_FLOOR = 5_600;

/**
 * Returns the S&P 500 index level for the month containing `dateStr`.
 * Resolution order:
 *   1. Exact month key in sp500Map (live FRED data from price_cache)
 *   2. Most recent month in sp500Map (proxy for future dates or gaps)
 *   3. SP500_FLOOR (emergency fallback; indicates cache is not seeded)
 */
export function sp500ForDate(dateStr: string, sp500Map: Map<string, number>): number {
  const d   = new Date(dateStr);
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  if (sp500Map.has(key)) return sp500Map.get(key)!;
  if (sp500Map.size > 0) {
    const sorted = [...sp500Map.keys()].sort();
    return sp500Map.get(sorted[sorted.length - 1])!;
  }
  return SP500_FLOOR;
}

// ── Health score engine ────────────────────────────────────────────────────────

/**
 * Rule-based health score (0–100).
 *
 * Starts at 50 (neutral). Each metric independently adjusts it based on
 * pre-defined thresholds that represent institutional portfolio management norms.
 * The final score is clamped to [0, 100].
 *
 * This is the same logic as the `get_insights` action in ml-pipeline.
 * Having it here lets us unit-test every threshold without a Deno runtime.
 */
export function computeHealthScore(m: HealthMetrics): number {
  let score = 50;

  // Sharpe ratio contribution (±30 points maximum)
  if      (m.sharpe >  1.5) score += 20;
  else if (m.sharpe >  1.0) score += 12;
  else if (m.sharpe >  0.5) score +=  6;
  else if (m.sharpe < -0.5) score -= 30;
  else if (m.sharpe <  0.0) score -= 20;

  // Alpha vs S&P 500 (±20 points maximum)
  if      (m.alpha >  3) score += 15;
  else if (m.alpha >  1) score +=  8;
  else if (m.alpha >  0) score +=  3;
  else if (m.alpha < -3) score -= 20;
  else if (m.alpha < -1) score -= 10;

  // Max drawdown (±20 points maximum)
  if      (m.maxDrawdown > -5)  score += 10;
  else if (m.maxDrawdown > -10) score +=  5;
  else if (m.maxDrawdown > -20) score +=  0;
  else if (m.maxDrawdown > -30) score -= 10;
  else                           score -= 20;

  // Win rate (±10 points)
  if      (m.winRate > 60) score += 10;
  else if (m.winRate > 50) score +=  5;
  else if (m.winRate < 40) score -= 10;

  // VaR 95% (±10 points)
  if      (m.var95 > -1) score +=  5;
  else if (m.var95 > -2) score +=  3;
  else if (m.var95 < -5) score -= 10;
  else if (m.var95 < -3) score -=  5;

  // 5-day momentum (±5 points)
  if      (m.momentum5 >  3) score +=  5;
  else if (m.momentum5 >  0) score +=  2;
  else if (m.momentum5 < -5) score -=  5;
  else if (m.momentum5 <  0) score -=  2;

  // Cash position (±5 points): too much drag, too little buffer
  if      (m.cashPct >= 5 && m.cashPct <= 25)                   score += 5;
  else if (m.cashPct > 40)                                        score -= 3;
  else if (m.cashPct < 2 && m.positionsCount > 0)                score -= 3;

  // Annualised volatility (±10 points)
  if      (m.annVol < 15) score +=  5;
  else if (m.annVol > 40) score -= 10;
  else if (m.annVol > 30) score -=  5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Human-readable label for a health score value. */
export function healthLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 35) return 'Poor';
  return 'Critical';
}
