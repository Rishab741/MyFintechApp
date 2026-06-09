// ── Brokerage catalogue ────────────────────────────────────────────────────────

export interface BrokerageCatalogueItem {
  slug:          string;   // 'ROBINHOOD', 'SCHWAB', 'COINBASE'
  name:          string;
  logo_url:      string | null;
  url:           string | null;
  primary_color: string | null;
  description:   string | null;
  account_types: string[];
  is_crypto:     boolean;
  is_featured:   boolean;
  display_order: number;
}

// ── Connected accounts ────────────────────────────────────────────────────────

export type BrokerageProvider = "snaptrade" | "plaid" | "manual";

export interface BrokerageAccount {
  id:                   string;
  user_id:              string;
  provider:             BrokerageProvider;
  snaptrade_account_id: string | null;
  brokerage_slug:       string | null;
  brokerage_name:       string | null;
  brokerage_logo_url:   string | null;
  account_name:         string | null;
  account_number:       string | null;
  account_type:         string | null;
  currency:             string;
  is_active:            boolean;
  last_synced_at:       string | null;
  sync_error:           string | null;
  reconnect_required:   boolean;
  created_at:           string;
}

// ── Connection summary (from query_brokerage_summary view) ────────────────────

export interface BrokerageSummary {
  total_accounts:       number;
  healthy_accounts:     number;
  needs_reconnect:      number;
  last_synced_at:       string | null;
  connected_brokerages: string[];
}

// ── SnapTrade portal flow ─────────────────────────────────────────────────────

export interface PortalResult {
  status: "connected" | "cancelled" | "error";
  accounts_connected: number;
  error?: string;
}
