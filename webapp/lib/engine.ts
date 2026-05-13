/**
 * Typed client for the Vestara Portfolio Engine.
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

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function engineFetch<T>(
  path: string,
  jwt: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Engine ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── API methods ───────────────────────────────────────────────────────────────

export const engine = {
  portfolio: {
    metrics: (jwt: string, period = "1Y") =>
      engineFetch<PortfolioMetrics>(`/v1/portfolio/metrics?period=${period}`, jwt),
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
};
