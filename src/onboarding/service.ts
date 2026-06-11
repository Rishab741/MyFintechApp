import { supabase } from "@/src/lib/supabase";
import type {
  BrokerageAccount,
  BrokerageCatalogueItem,
  BrokerageSummary,
} from "./types";

// ── Catalogue ─────────────────────────────────────────────────────────────────

export async function fetchBrokerageCatalogue(refresh = false): Promise<BrokerageCatalogueItem[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/list-brokerages${refresh ? "?refresh=1" : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch brokerages (${res.status})`);
  const json = await res.json();
  return json.brokerages as BrokerageCatalogueItem[];
}

// ── Connected accounts ────────────────────────────────────────────────────────

export async function listBrokerageAccounts(): Promise<BrokerageAccount[]> {
  const { data, error } = await supabase
    .from("brokerage_accounts")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BrokerageAccount[];
}

export async function getBrokerageSummary(): Promise<BrokerageSummary | null> {
  const { data, error } = await supabase
    .from("query_brokerage_summary")
    .select("*")
    .maybeSingle();
  if (error) return null;
  return data as BrokerageSummary | null;
}

export async function disconnectAccount(accountId: string): Promise<void> {
  const { error } = await supabase
    .from("brokerage_accounts")
    .update({ is_active: false, sync_error: null })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
}

// ── SnapTrade portal ──────────────────────────────────────────────────────────

/**
 * Registers the user with SnapTrade (if not already done) and returns
 * the redirect_uri for the connection portal.
 *
 * The portal is SnapTrade's hosted UI. When the user completes it,
 * SnapTrade redirects to myfintechapp://snaptrade-callback with
 * ?status=success&brokerage_authorization_id=XXX
 */
export async function getSnapTradePortalUrl(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // user_id is extracted from the JWT on the server — do not send it in the body
  const { data, error } = await supabase.functions.invoke("exchange-plaid-token", {
    body: { action: "snaptrade_create" },
  });

  if (error) {
    // supabase-js wraps non-2xx responses as FunctionsHttpError with the raw
    // Response in `context`. Extract the body so the user sees the real reason
    // (e.g. "Config missing" for missing secrets, or a SnapTrade API message).
    let detail: string = error.message ?? "Failed to start connection portal";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await (error as any).context?.json?.();
      if (body?.error)   detail = body.error;
      if (body?.message) detail = body.message;
    } catch { /* response body not JSON — keep the default message */ }
    console.error("[getSnapTradePortalUrl]", detail);
    throw new Error(detail);
  }

  if (data?.already_connected) throw new Error("ALREADY_CONNECTED");
  if (!data?.redirect_uri) throw new Error(data?.error ?? "No portal URL returned");
  return data.redirect_uri as string;
}

/**
 * Called from the deep-link handler after SnapTrade redirects back.
 * Saves all accounts from SnapTrade into brokerage_accounts.
 */
export async function saveSnapTradeConnection(
  brokerageAuthorizationId: string | null,
): Promise<{ accounts_connected: number }> {
  const { data, error } = await supabase.functions.invoke("exchange-plaid-token", {
    body: {
      action:                    "snaptrade_save_connection",
      brokerage_authorization_id: brokerageAuthorizationId,
    },
  });
  if (error) throw new Error(error.message ?? "Failed to save connection");
  return { accounts_connected: data?.accounts_connected ?? 1 };
}

/**
 * Triggers a fresh holdings sync for all connected SnapTrade accounts.
 */
export async function syncSnapTradeHoldings(): Promise<void> {
  await supabase.functions.invoke("exchange-plaid-token", {
    body: { action: "snaptrade_get_holdings" },
  });
}
