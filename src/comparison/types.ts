// ── Scenario configuration ────────────────────────────────────────────────────

export type RebalancingStrategy =
  | "hold"
  | "monthly"
  | "quarterly"
  | "threshold_10pct"
  | "threshold_20pct";

export interface Scenario {
  id:                          string;
  user_id:                     string;
  name:                        string;
  description:                 string | null;
  comparison_assets:           string[];
  period_start:                string | null;
  period_end:                  string | null;
  initial_capital:             number | null;
  currency:                    string;
  rebalancing_strategy:        RebalancingStrategy;
  apply_behavioral_adjustment: boolean;
  apply_dividend_reinvestment: boolean;
  apply_tax_simulation:        boolean;
  run_monte_carlo:             boolean;
  is_bookmarked:               boolean;
  last_run_at:                 string | null;
  created_at:                  string;
  updated_at:                  string;
}

export type CreateScenarioInput = Omit<Scenario, "id" | "user_id" | "created_at" | "updated_at" | "last_run_at">;

// ── Scenario run ──────────────────────────────────────────────────────────────

export type RunStatus = "queued" | "running" | "complete" | "failed" | "expired";

export interface ScenarioRun {
  run_id:       string;
  status:       RunStatus;
  started_at:   string | null;
  completed_at: string | null;
  error:        string | null;
  results:      ScenarioResults | null;
}

// ── Results ───────────────────────────────────────────────────────────────────

export interface TimeseriesPoint {
  date:   string;
  actual: number;
  [key: string]: number | string; // dynamic keys: SPY_perfect, SPY_realistic, etc.
}

export interface AssetMetrics {
  label:        string;
  total_return: number;  // percentage
  cagr:         number;
  volatility:   number;
  sharpe:       number;
  sortino:      number;
  max_drawdown: number;
  calmar:       number;
  var_95:       number;
  win_rate:     number;
  start_value:  number;
  end_value:    number;
  n_days:       number;
}

export interface DecisionNode {
  date:              string;
  transaction_type:  "buy" | "sell";
  symbol:            string;
  price:             number | null;
  quantity:          number | null;
  actual_delta_30d:  number;
  alt_deltas_30d:    Record<string, number>;
  impact_score:      number;
}

export interface DecisionTree {
  nodes:        DecisionNode[];
  total_nodes:  number;
}

export interface TOIAlternative {
  dollar_gap:        number;
  pct_gap:           number;
  months_to_recover: number;
  outperformed:      boolean;
}

export interface TemporalOpportunity {
  monthly_savings_assumption: number;
  best_alternative:           string | null;
  best_dollar_gap:            number;
  alternatives:               Record<string, TOIAlternative>;
}

export interface BehavioralProfile {
  avg_holding_days:           number | null;
  median_holding_days:        number | null;
  max_holding_days:           number | null;
  avg_exit_drawdown_pct:      number | null;
  panic_sell_probability_10:  number;
  panic_sell_probability_20:  number;
  buy_dip_probability:        number;
  avg_days_between_trades:    number | null;
  avg_position_size_pct:      number;
  max_position_concentration: number;
  loss_aversion_score:        number;
  timing_quality_score:       number;
  concentration_score:        number;
  transaction_count:          number;
  profile_confidence:         "insufficient" | "low" | "medium" | "high";
  opted_into_aggregate:       boolean;
  derived_at:                 string;
}

export interface MonteCarloFan {
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
}

export interface ScenarioResults {
  timeseries:           TimeseriesPoint[];
  metrics:              Record<string, AssetMetrics>;
  decision_tree:        DecisionTree;
  inflection_points:    DecisionNode[];
  temporal_opportunity: TemporalOpportunity;
  behavioral_profile:   BehavioralProfile;
  monte_carlo:          Record<string, MonteCarloFan> | null;
  computation_ms:       number;
  data_quality_score:   number;
  expires_at:           string;
}

// ── Asset universe ────────────────────────────────────────────────────────────

export type AssetClass = "equity" | "etf" | "crypto" | "forex" | "commodity" | "index" | "bond";

export interface ComparisonAsset {
  symbol:       string;
  name:         string;
  asset_class:  AssetClass;
  sector:       string | null;
  exchange:     string | null;
  currency:     string;
  is_featured:  boolean;
  description:  string | null;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

export const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  equity:    "#8FF5FF",
  etf:       "#ac89ff",
  crypto:    "#f59e0b",
  forex:     "#10b981",
  commodity: "#f97316",
  index:     "#64748b",
  bond:      "#6366f1",
};

export const REBALANCING_LABELS: Record<RebalancingStrategy, string> = {
  hold:             "Buy & Hold",
  monthly:          "Monthly Rebalance",
  quarterly:        "Quarterly Rebalance",
  threshold_10pct:  "Rebalance at ±10%",
  threshold_20pct:  "Rebalance at ±20%",
};

// Series colors for charting — first = actual portfolio
export const SERIES_COLORS = [
  "#8FF5FF",  // actual → cyan
  "#ac89ff",  // first alt
  "#f59e0b",  // second alt
  "#10b981",  // third alt
  "#f97316",  // fourth alt
  "#6366f1",  // fifth alt
];
