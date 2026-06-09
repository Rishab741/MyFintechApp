/**
 * Portfolio Risk Scoring — multi-factor model
 *
 * Produces a 0-100 composite risk score from six quantitative inputs.
 * Higher score = higher risk. Each factor is scored independently then
 * combined with calibrated weights.
 *
 * Factors and weights:
 *   Volatility (annualised %)     — 30%
 *   Sharpe Ratio                  — 20%
 *   Max Drawdown (%)              — 25%
 *   Value-at-Risk 95% (%)        — 10%
 *   Win Rate (%)                  — 10%
 *   Alpha (%)                     —  5%
 */

export interface ScoringInputs {
  vol:        number;  // annualised volatility %
  sharpe:     number;  // sharpe ratio
  maxDrawdown: number; // max drawdown % (typically negative, we use abs)
  var95:      number;  // 95% VaR % (typically negative)
  winRate:    number;  // 0–100
  alpha:      number;  // alpha %
}

export interface ScoreBreakdown {
  volatility:  number;
  sharpe:      number;
  drawdown:    number;
  var95:       number;
  winRate:     number;
  alpha:       number;
}

export interface PortfolioScore {
  score:     number;          // 0–100 composite risk score
  grade:     string;          // A+ → F
  label:     string;          // Conservative → Highly Speculative
  color:     string;          // hex colour token
  breakdown: ScoreBreakdown;  // per-factor sub-scores (0–100 each)
  insights:  ScoreInsight[];  // up to 3 dynamic insight banners
}

export interface ScoreInsight {
  type:    "positive" | "warning" | "neutral";
  title:   string;
  body:    string;
}

// ── Per-factor scoring functions (all return 0–100, higher = riskier) ─────────

function scoreVol(vol: number): number {
  if (vol < 5)  return 8;
  if (vol < 10) return 20;
  if (vol < 15) return 35;
  if (vol < 20) return 50;
  if (vol < 30) return 65;
  if (vol < 40) return 80;
  return 95;
}

function scoreSharpe(sharpe: number): number {
  // Good Sharpe = low risk score
  if (sharpe >= 2.5) return 5;
  if (sharpe >= 2.0) return 12;
  if (sharpe >= 1.5) return 22;
  if (sharpe >= 1.0) return 35;
  if (sharpe >= 0.5) return 52;
  if (sharpe >= 0.0) return 68;
  if (sharpe >= -0.5) return 82;
  return 95;
}

function scoreDrawdown(dd: number): number {
  const abs = Math.abs(dd);
  if (abs < 3)   return 8;
  if (abs < 7)   return 20;
  if (abs < 12)  return 35;
  if (abs < 20)  return 52;
  if (abs < 30)  return 68;
  if (abs < 45)  return 82;
  return 95;
}

function scoreVar(var95: number): number {
  const abs = Math.abs(var95);
  if (abs < 1)   return 10;
  if (abs < 2)   return 25;
  if (abs < 3.5) return 42;
  if (abs < 5)   return 60;
  if (abs < 7)   return 78;
  return 92;
}

function scoreWinRate(wr: number): number {
  if (wr >= 65) return 10;
  if (wr >= 55) return 25;
  if (wr >= 50) return 40;
  if (wr >= 45) return 58;
  if (wr >= 40) return 73;
  return 88;
}

function scoreAlpha(alpha: number): number {
  if (alpha >= 5)   return 5;
  if (alpha >= 2)   return 18;
  if (alpha >= 0)   return 35;
  if (alpha >= -2)  return 58;
  if (alpha >= -5)  return 78;
  return 92;
}

// ── Composite ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
  volatility: 0.30,
  sharpe:     0.20,
  drawdown:   0.25,
  var95:      0.10,
  winRate:    0.10,
  alpha:      0.05,
};

const GRADE_THRESHOLDS: [number, string][] = [
  [15,  "A+"],
  [25,  "A" ],
  [38,  "B+"],
  [50,  "B" ],
  [60,  "C+"],
  [70,  "C" ],
  [80,  "D" ],
  [100, "F" ],
];

const LABEL_THRESHOLDS: [number, string, string][] = [
  [22,  "Conservative",       "#00E09A"],
  [40,  "Moderate",           "#8FF5FF"],
  [58,  "Balanced Aggressive","#F59E0B"],
  [72,  "Aggressive",         "#F97316"],
  [100, "Highly Speculative", "#FF716C"],
];

function toGrade(score: number): string {
  return GRADE_THRESHOLDS.find(([t]) => score <= t)?.[1] ?? "F";
}

function toLabelAndColor(score: number): [string, string] {
  const found = LABEL_THRESHOLDS.find(([t]) => score <= t);
  return found ? [found[1], found[2]] : ["Highly Speculative", "#FF716C"];
}

// ── Dynamic insights ──────────────────────────────────────────────────────────

function buildInsights(inputs: ScoringInputs, breakdown: ScoreBreakdown): ScoreInsight[] {
  const insights: ScoreInsight[] = [];

  // Volatility
  if (breakdown.volatility >= 65) {
    insights.push({
      type: "warning",
      title: "High Volatility Detected",
      body: `Annualised volatility of ${inputs.vol.toFixed(1)}% exceeds typical thresholds. Consider adding low-correlation assets (bonds, gold) to dampen swings.`,
    });
  } else if (breakdown.volatility <= 25) {
    insights.push({
      type: "positive",
      title: "Low Volatility Profile",
      body: `Your portfolio's ${inputs.vol.toFixed(1)}% annualised volatility suggests strong diversification or a defensive tilt.`,
    });
  }

  // Sharpe
  if (inputs.sharpe >= 1.5) {
    insights.push({
      type: "positive",
      title: `Strong Risk-Adjusted Returns (Sharpe ${inputs.sharpe.toFixed(2)})`,
      body: "You're generating meaningful excess return per unit of risk. Maintain your current allocation discipline.",
    });
  } else if (inputs.sharpe < 0.5 && inputs.sharpe >= 0) {
    insights.push({
      type: "warning",
      title: `Low Sharpe Ratio (${inputs.sharpe.toFixed(2)})`,
      body: "Returns are not adequately compensating for the risk being taken. Review your highest-risk, lowest-return positions.",
    });
  } else if (inputs.sharpe < 0) {
    insights.push({
      type: "warning",
      title: `Negative Sharpe Ratio (${inputs.sharpe.toFixed(2)})`,
      body: "Risk-free assets are currently outperforming your portfolio on a risk-adjusted basis. Review your strategy.",
    });
  }

  // Drawdown
  if (Math.abs(inputs.maxDrawdown) >= 20) {
    insights.push({
      type: "warning",
      title: `Significant Drawdown (${inputs.maxDrawdown.toFixed(1)}%)`,
      body: "Your portfolio has experienced a substantial peak-to-trough decline. Ensure position sizing aligns with your loss tolerance.",
    });
  }

  // Win rate
  if (inputs.winRate >= 60) {
    insights.push({
      type: "positive",
      title: `Consistent Win Rate (${inputs.winRate.toFixed(0)}%)`,
      body: "More than 6 in 10 of your days are positive. This consistency compounds meaningfully over time.",
    });
  }

  // Alpha
  if (inputs.alpha > 3) {
    insights.push({
      type: "positive",
      title: `Generating Alpha (+${inputs.alpha.toFixed(1)}%)`,
      body: "Your portfolio is outperforming the benchmark on a risk-adjusted basis — a rare and meaningful signal.",
    });
  } else if (inputs.alpha < -3) {
    insights.push({
      type: "warning",
      title: `Negative Alpha (${inputs.alpha.toFixed(1)}%)`,
      body: "Your portfolio is underperforming the benchmark after adjusting for risk. A low-cost index fund may be worth comparing against.",
    });
  }

  // Return top 3 most impactful
  return insights.slice(0, 3);
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computePortfolioScore(inputs: Partial<ScoringInputs>): PortfolioScore {
  const safe: ScoringInputs = {
    vol:         inputs.vol         ?? 0,
    sharpe:      inputs.sharpe      ?? 0,
    maxDrawdown: inputs.maxDrawdown ?? 0,
    var95:       inputs.var95       ?? 0,
    winRate:     inputs.winRate     ?? 50,
    alpha:       inputs.alpha       ?? 0,
  };

  const breakdown: ScoreBreakdown = {
    volatility: scoreVol(safe.vol),
    sharpe:     scoreSharpe(safe.sharpe),
    drawdown:   scoreDrawdown(safe.maxDrawdown),
    var95:      scoreVar(safe.var95),
    winRate:    scoreWinRate(safe.winRate),
    alpha:      scoreAlpha(safe.alpha),
  };

  const score = Math.round(
    breakdown.volatility * WEIGHTS.volatility +
    breakdown.sharpe     * WEIGHTS.sharpe     +
    breakdown.drawdown   * WEIGHTS.drawdown   +
    breakdown.var95      * WEIGHTS.var95      +
    breakdown.winRate    * WEIGHTS.winRate    +
    breakdown.alpha      * WEIGHTS.alpha,
  );

  const [label, color] = toLabelAndColor(score);

  return {
    score,
    grade:     toGrade(score),
    label,
    color,
    breakdown,
    insights:  buildInsights(safe, breakdown),
  };
}
