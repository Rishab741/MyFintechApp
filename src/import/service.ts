import { supabase } from "@/src/lib/supabase";
import type {
  ColumnMap,
  CsvImportJob,
  ExchangeConnection,
  ExchangeSlug,
  ImportResult,
  ParseColumnsResponse,
} from "./types";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return `Bearer ${session.access_token}`;
}

async function edgeFetch(path: string, formData: FormData): Promise<Response> {
  const auth = await getAuthHeader();
  const res  = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method:  "POST",
    headers: { Authorization: auth },
    body:    formData,
  });
  return res;
}

// ── CSV import ────────────────────────────────────────────────────────────────

/**
 * Step 1 — Upload file to get detected columns and a preview.
 */
export async function parseFileColumns(
  fileUri: string,
  fileName: string,
  mimeType?: string,
): Promise<ParseColumnsResponse> {
  const auth = await getAuthHeader();

  const fd = new FormData();
  fd.append("file", {
    uri:  fileUri,
    name: fileName,
    type: mimeType ?? (fileName.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv"),
  } as any);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-csv/parse`, {
    method:  "POST",
    headers: { Authorization: auth },
    body:    fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Parse failed (${res.status})`);
  }
  return res.json();
}

/**
 * Step 2 — Submit mapping + file to import rows into the ledger.
 */
export async function importCsvFile(
  fileUri: string,
  fileName: string,
  mapping: ColumnMap,
  mimeType?: string,
): Promise<ImportResult> {
  const auth = await getAuthHeader();

  const fd = new FormData();
  fd.append("file", {
    uri:  fileUri,
    name: fileName,
    type: mimeType ?? (fileName.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv"),
  } as any);
  fd.append("mapping", JSON.stringify(mapping));

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-csv/import`, {
    method:  "POST",
    headers: { Authorization: auth },
    body:    fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Import failed (${res.status})`);
  }
  return res.json();
}

/**
 * Fetch the user's import history.
 */
export async function listImportJobs(limit = 20): Promise<CsvImportJob[]> {
  const { data, error } = await supabase
    .from("csv_import_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as CsvImportJob[];
}

// ── Exchange connections ───────────────────────────────────────────────────────

export async function listConnections(): Promise<ExchangeConnection[]> {
  const { data, error } = await supabase
    .from("exchange_connections")
    .select("id, exchange, label, connection_type, is_active, last_synced_at, sync_error, token_expires_at, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExchangeConnection[];
}

/**
 * Exchange Coinbase OAuth authorization code for tokens (server-side).
 */
export async function exchangeCoinbaseCode(
  code: string,
  redirectUri: string,
): Promise<{ exchange: string; label: string; scope: string }> {
  const { data, error } = await supabase.functions.invoke("coinbase-oauth/exchange", {
    body: { code, redirect_uri: redirectUri },
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Validate and store a Binance API key pair.
 */
export async function connectBinanceKey(
  apiKey: string,
  apiSecret: string,
  exchange: "binance" | "binance_us",
): Promise<{ exchange: string; label: string; valid: boolean }> {
  const { data, error } = await supabase.functions.invoke("coinbase-oauth/binance-key", {
    body: { api_key: apiKey, api_secret: apiSecret, exchange },
  });
  if (error) throw new Error(error.message ?? "Validation failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Disconnect (revoke + deactivate) an exchange connection.
 */
export async function disconnectExchange(exchangeId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("coinbase-oauth/disconnect", {
    body: { exchange_id: exchangeId },
  });
  if (error) throw new Error(error.message);
}

/**
 * Build the Coinbase OAuth authorization URL for the mobile deep-link flow.
 */
export function buildCoinbaseAuthUrl(redirectUri: string): string {
  const clientId = process.env.EXPO_PUBLIC_COINBASE_CLIENT_ID ?? "";
  const scopes = [
    "wallet:accounts:read",
    "wallet:transactions:read",
    "wallet:buys:read",
    "wallet:sells:read",
  ].join(",");
  const params = new URLSearchParams({
    response_type: "code",
    client_id:     clientId,
    redirect_uri:  redirectUri,
    scope:         scopes,
    account:       "all",
  });
  return `https://www.coinbase.com/oauth/authorize?${params}`;
}
