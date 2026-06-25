/**
 * Typed client for the Platstock Portfolio Engine.
 * All calls attach the caller's Supabase JWT as Bearer token.
 */

const BASE = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8000";

export interface PortfolioMetrics {
  user_id:            string;
  period:             string;
  twr:                number | null;
  cagr:               number | null;
  sharpe:             number | null;
  sortino:            number | null;
  max_drawdown:       number | null;
  beta:               number | null;
  alpha:              number | null;
  volatility:         number | null;
  computed_at:        string;
  snapshot_age_hours: number;
  is_data_stale:      boolean;
}

export interface TenantProfile {
  id:                string;
  name:              string;
  slug:              string;
  tier:              string;
  owner_email:       string | null;
  is_active:         boolean;
  api_key_label:     string | null;
  api_key_issued_at: string | null;
  has_api_key:       boolean;
  created_at:        string;
}

export interface UsageSummary {
  tenant_id:    string;
  tier:         string;
  month:        string;
  api_calls:    number;
  compute_runs: number;
  price_syncs:  number;
  daily_limit:  number | null;
}

export interface LedgerVerification {
  user_id:      string;
  tenant_id:    string;
  chain_ok:     boolean;
  tx_count:     number;
  broken_links: { tx_id: string; settled_at: string; issue: string }[];
  verified_at:  string;
}

export interface AuditEntry {
  id:          number;
  event_type:  string;
  resource:    string | null;
  resource_id: string | null;
  metadata:    Record<string, unknown>;
  created_at:  string;
}

export interface ApiKeyResponse {
  api_key:   string;
  label:     string | null;
  issued_at: string;
  warning:   string;
}

export interface IngestResult {
  custodian:             string;
  file_name:             string;
  holdings_upserted:     number;
  transactions_inserted: number;
  skipped:               number;
  errors:                string[];
}

export interface CustodianInfo {
  slug:                  string;
  label:                 string;
  supports_holdings:     boolean;
  supports_transactions: boolean;
}

export interface HealthScoreBreakdown {
  diversification:     number;
  risk_return:         number;
  drawdown_resilience: number;
  consistency:         number;
  cash_efficiency:     number;
}

export interface HealthScoreResponse {
  score:       number;
  grade:       string;
  breakdown:   HealthScoreBreakdown;
  insights:    string[];
  computed_at: string;
}

export interface WhatIfTimePoint {
  date:         string;
  hypothetical: number;
  portfolio:    number;
  benchmark:    number;
}

export interface WhatIfResponse {
  symbol:              string;
  amount_invested:     number;
  start_date:          string;
  end_date:            string;
  hypothetical_final:  number;
  hypothetical_return: number;
  hypothetical_cagr:   number;
  actual_return:       number;
  actual_cagr:         number;
  benchmark_return:    number;
  benchmark_cagr:      number;
  winner:              "hypothetical" | "portfolio" | "benchmark";
  time_series:         WhatIfTimePoint[];
}

export interface PortfolioExposure {
  by_asset_class: { asset_class: string; market_value: number; allocation_pct: number; position_count: number }[];
  by_sector:      { sector: string; market_value: number; allocation_pct: number }[];
  by_currency:    { currency: string; market_value: number; allocation_pct: number }[];
  concentration: {
    top_10_pct:       number;
    top_3_pct:        number;
    herfindahl_index: number;
    effective_n:      number;
    largest_position: { symbol: string; allocation_pct: number; market_value: number } | null;
  };
  position_count: number;
  total_value:    number;
  cash_value:     number;
  invested_value: number;
  cash_pct:       number;
}

export interface PortfolioNavPoint {
  time:            string;
  total_value:     number;
  cash_value:      number;
  invested_value:  number;
  daily_return:    number | null;
  benchmark_value: number | null;
}

export interface PortfolioHistory {
  period:           string;
  nav_series:       PortfolioNavPoint[];
  benchmark_symbol: string;
  data_points:      number;
}

export interface RefreshResult {
  symbols_synced:   number;
  symbols_failed:   number;
  periods_computed: string[];
  refreshed_at:     string;
}

export interface PipelineStatus {
  snapshot_count:   number;
  holdings_count:   number;
  last_computed_at: string | null;
  last_synced_at:   string | null;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function engineFetch<T>(
  path: string,
  jwt: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch (err: any) {
    // Network-level failure (connection refused, no internet, etc.)
    const isOffline =
      err?.message?.includes("Failed to fetch") ||
      err?.message?.includes("ERR_CONNECTION_REFUSED") ||
      err?.code === "ECONNREFUSED";
    if (isOffline) {
      throw new Error(
        "Engine offline — start the Python engine: cd services/engine && uvicorn main:app --reload --port 8000",
      );
    }
    throw err;
  }
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    throw new Error(`Engine ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── API methods ───────────────────────────────────────────────────────────────

export const engine = {
  portfolio: {
    metrics: (jwt: string, period = "1Y") =>
      engineFetch<PortfolioMetrics>(`/v1/portfolio/metrics?period=${period}`, jwt),

    healthScore: (jwt: string) =>
      engineFetch<HealthScoreResponse>("/v1/portfolio/health-score", jwt),

    whatIf: (jwt: string, symbol: string, amount: number, startDate: string) =>
      engineFetch<WhatIfResponse>("/v1/portfolio/what-if", jwt, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, amount, start_date: startDate }),
      }),

    exposure: (jwt: string) =>
      engineFetch<PortfolioExposure>("/v1/portfolio/exposure", jwt),

    history: (jwt: string, period = "3M") =>
      engineFetch<PortfolioHistory>(`/v1/portfolio/history?period=${period}`, jwt),

    status: (jwt: string) =>
      engineFetch<PipelineStatus>("/v1/portfolio/status", jwt),

    refresh: (jwt: string) =>
      engineFetch<RefreshResult>("/v1/portfolio/refresh", jwt, { method: "POST" }),
  },

  tenant: {
    me:    (jwt: string) => engineFetch<TenantProfile>("/v1/tenant/me", jwt),
    usage: (jwt: string) => engineFetch<UsageSummary>("/v1/tenant/usage", jwt),

    issueApiKey: (jwt: string, label?: string) =>
      engineFetch<ApiKeyResponse>("/v1/tenant/api-key", jwt, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label ?? null }),
      }),

    revokeApiKey: (jwt: string) =>
      engineFetch<{ revoked: boolean }>("/v1/tenant/api-key", jwt, { method: "DELETE" }),
  },

  ledger: {
    verify: (jwt: string) => engineFetch<LedgerVerification>("/v1/ledger/verify", jwt),
  },

  audit: {
    logs: (jwt: string, limit = 50, offset = 0, eventType?: string) => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (eventType) params.set("event_type", eventType);
      return engineFetch<{ entries: AuditEntry[]; total: number; limit: number; offset: number }>(
        `/v1/audit/logs?${params}`,
        jwt,
      );
    },
  },

  ingest: {
    custodians: (jwt: string) => engineFetch<CustodianInfo[]>("/v1/ingest/custodians", jwt),

    upload: (jwt: string, custodian: string, file: File, dataType: string) => {
      const form = new FormData();
      form.append("file", file);
      form.append("data_type", dataType);
      return engineFetch<IngestResult>(`/v1/ingest/${custodian}`, jwt, {
        method: "POST",
        body: form,
      });
    },
  },

  simulate: {
    run: (jwt: string, req: ScenarioRequest) =>
      engineFetch<{ job_id: string; status: string }>("/v1/simulate/scenario", jwt, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }),

    poll: (jwt: string, jobId: string) =>
      engineFetch<SimJobResult>(`/v1/simulate/scenario/${jobId}`, jwt),

    rebuildProfile: (jwt: string, userId: string) =>
      engineFetch<{ status: string; profile_confidence: string }>(
        "/v1/simulate/behavioral-profile", jwt,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        },
      ),
  },
};

// ── Simulation types ──────────────────────────────────────────────────────────

export interface ScenarioRequest {
  user_id:                     string;
  run_id:                      string;
  comparison_assets:           string[];
  period_start:                string | null;
  period_end:                  string | null;
  initial_capital?:            number | null;
  rebalancing_strategy:        string;
  apply_behavioral_adjustment: boolean;
  apply_dividend_reinvestment: boolean;
  run_monte_carlo:             boolean;
  monthly_savings_assumption:  number;
}

export interface SimAssetMetrics {
  label:        string;
  total_return: number;
  cagr:         number;
  volatility:   number;
  sharpe:       number;
  sortino:      number;
  max_drawdown: number;
  var_95:       number;
  win_rate:     number;
  start_value:  number;
  end_value:    number;
}

export interface SimTimePoint {
  date:   string;
  actual: number;
  [key: string]: number | string;
}

export interface SimDecisionNode {
  date:              string;
  transaction_type:  "buy" | "sell";
  symbol:            string;
  actual_delta_30d:  number;
  alt_deltas_30d:    Record<string, number>;
  impact_score:      number;
}

export interface SimTOI {
  monthly_savings_assumption: number;
  best_alternative:           string | null;
  best_dollar_gap:            number;
  alternatives: Record<string, {
    dollar_gap:        number;
    pct_gap:           number;
    months_to_recover: number;
    outperformed:      boolean;
  }>;
}

export interface MonteCarloFan {
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
}

export interface SimJobResult {
  status:              "queued" | "running" | "complete" | "failed";
  run_id?:             string;
  error?:              string;
  timeseries?:         SimTimePoint[];
  metrics?:            Record<string, SimAssetMetrics>;
  inflection_points?:  SimDecisionNode[];
  temporal_opportunity?: SimTOI;
  monte_carlo?:        Record<string, MonteCarloFan> | null;
  computation_ms?:     number;
  data_quality_score?: number;
}
