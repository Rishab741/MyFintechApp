// ── Column mapping ────────────────────────────────────────────────────────────

export const REQUIRED_FIELDS = ["date", "symbol", "side", "quantity", "price"] as const;
export const OPTIONAL_FIELDS = ["fee", "currency", "notes"] as const;
export const ALL_FIELDS      = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;

export type RequiredField = typeof REQUIRED_FIELDS[number];
export type OptionalField = typeof OPTIONAL_FIELDS[number];
export type MappingField  = RequiredField | OptionalField;

export const FIELD_LABELS: Record<MappingField, string> = {
  date:     "Date / Timestamp",
  symbol:   "Asset / Symbol / Ticker",
  side:     "Buy or Sell",
  quantity: "Quantity / Units",
  price:    "Price per Unit",
  fee:      "Fee / Commission",
  currency: "Currency",
  notes:    "Notes / Description",
};

export const FIELD_EXAMPLES: Record<MappingField, string> = {
  date:     "e.g. 2024-01-15, 15/01/2024, Jan 15 2024",
  symbol:   "e.g. BTC, ETH, AAPL, BTC-USD",
  side:     "e.g. Buy, Sell, BUY, SELL, b, s",
  quantity: "e.g. 0.05, 100, 2.5",
  price:    "e.g. 45000.00, $45,000",
  fee:      "e.g. 1.50, 0.001",
  currency: "e.g. USD, GBP, EUR",
  notes:    "e.g. DCA purchase, Limit order",
};

export type ColumnMap = {
  date:     string;
  symbol:   string;
  side:     string;
  quantity: string;
  price:    string;
  fee?:     string;
  currency?: string;
  notes?:   string;
};

// ── Parse response (step 1) ───────────────────────────────────────────────────

export interface ParseColumnsResponse {
  columns:      string[];
  preview_rows: Record<string, string>[];
  row_count:    number;
  detected_map: Partial<Record<MappingField, string | null>>;
}

// ── Import result (step 3) ────────────────────────────────────────────────────

export interface ImportResult {
  inserted: number;
  skipped:  number;
  errors:   string[];
}

// ── Import history ────────────────────────────────────────────────────────────

export type ImportStatus = "complete" | "partial" | "failed";

export interface CsvImportJob {
  id:             string;
  file_name:      string;
  row_count:      number;
  inserted:       number;
  skipped:        number;
  error_count:    number;
  errors:         string[];
  status:         ImportStatus;
  column_mapping: ColumnMap | null;
  created_at:     string;
}

// ── Exchange connectivity ─────────────────────────────────────────────────────

export type ExchangeSlug = "coinbase" | "binance" | "binance_us";
export type ConnectionType = "oauth" | "api_key";

export interface ExchangeConnection {
  id:               string;
  exchange:         ExchangeSlug;
  label:            string;
  connection_type:  ConnectionType;
  is_active:        boolean;
  last_synced_at:   string | null;
  sync_error:       string | null;
  token_expires_at: string | null;
  created_at:       string;
}

export const EXCHANGE_META: Record<ExchangeSlug, { name: string; color: string; icon: string }> = {
  coinbase:   { name: "Coinbase",    color: "#0052FF", icon: "bank" },
  binance:    { name: "Binance",     color: "#F3BA2F", icon: "currency-btc" },
  binance_us: { name: "Binance.US",  color: "#F3BA2F", icon: "currency-btc" },
};
