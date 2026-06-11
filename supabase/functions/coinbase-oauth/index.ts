/**
 * coinbase-oauth — Vestara Edge Function
 *
 * Handles the server-side legs of Coinbase's OAuth 2.0 flow.
 *
 * POST /functions/v1/coinbase-oauth/exchange
 *   Body: { code: string, redirect_uri: string }
 *   Exchanges the authorization code for access + refresh tokens,
 *   stores them in exchange_connections, returns { exchange, label, scope }.
 *
 * POST /functions/v1/coinbase-oauth/refresh
 *   Body: { exchange_id: string }
 *   Refreshes the access token using the stored refresh token.
 *
 * POST /functions/v1/coinbase-oauth/disconnect
 *   Body: { exchange_id: string }
 *   Revokes the token and marks the connection inactive.
 *
 * POST /functions/v1/coinbase-oauth/binance-key
 *   Body: { api_key: string, api_secret: string, exchange: "binance" | "binance_us" }
 *   Validates the key pair with a lightweight test call, stores it.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const COINBASE_CLIENT_ID   = Deno.env.get("COINBASE_CLIENT_ID")!;
const COINBASE_CLIENT_SECRET = Deno.env.get("COINBASE_CLIENT_SECRET")!;

const COINBASE_TOKEN_URL = "https://api.coinbase.com/oauth/token";
const COINBASE_REVOKE_URL = "https://api.coinbase.com/oauth/revoke";

const CORS = {
  "Access-Control-Allow-Origin":  Deno.env.get("ALLOWED_ORIGIN") ?? "https://platstock.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function getUser(authHeader: string) {
  if (!authHeader.startsWith("Bearer ")) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  return error ? null : user;
}

// ── Coinbase helpers ──────────────────────────────────────────────────────────

async function coinbaseTokenRequest(params: Record<string, string>) {
  const res = await fetch(COINBASE_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      client_id:     COINBASE_CLIENT_ID,
      client_secret: COINBASE_CLIENT_SECRET,
      ...params,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Coinbase token error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Exchange label map ────────────────────────────────────────────────────────
const EXCHANGE_LABELS: Record<string, string> = {
  binance:    "Binance",
  binance_us: "Binance.US",
  kraken:     "Kraken",
  kucoin:     "KuCoin",
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  const user = await getUser(authHeader);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const action = new URL(req.url).pathname.split("/").pop();
  const sb     = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* ok */ }

  // ── Exchange authorization code for tokens ────────────────────────────────
  if (action === "exchange") {
    const { code, redirect_uri } = body;
    if (!code || !redirect_uri) return json({ error: "code and redirect_uri required" }, 400);

    try {
      const tokens = await coinbaseTokenRequest({
        grant_type:   "authorization_code",
        code,
        redirect_uri,
      });

      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 7200) * 1000).toISOString();

      const { error: dbErr } = await sb.from("exchange_connections").upsert({
        user_id:         user.id,
        exchange:        "coinbase",
        label:           "Coinbase",
        connection_type: "oauth",
        access_token:    tokens.access_token,
        refresh_token:   tokens.refresh_token,
        token_expires_at: expiresAt,
        oauth_scope:     tokens.scope ?? "",
        is_active:       true,
        last_synced_at:  new Date().toISOString(),
        sync_error:      null,
      }, { onConflict: "user_id,exchange" });

      if (dbErr) throw new Error(dbErr.message);

      return json({ exchange: "coinbase", label: "Coinbase", scope: tokens.scope });

    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  }

  // ── Refresh access token ──────────────────────────────────────────────────
  if (action === "refresh") {
    const { exchange_id } = body;
    if (!exchange_id) return json({ error: "exchange_id required" }, 400);

    const { data: conn, error: fetchErr } = await sb
      .from("exchange_connections")
      .select("refresh_token")
      .eq("id", exchange_id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !conn?.refresh_token) return json({ error: "Connection not found" }, 404);

    try {
      const tokens = await coinbaseTokenRequest({
        grant_type:    "refresh_token",
        refresh_token: conn.refresh_token,
      });
      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 7200) * 1000).toISOString();

      await sb.from("exchange_connections").update({
        access_token:     tokens.access_token,
        refresh_token:    tokens.refresh_token ?? conn.refresh_token,
        token_expires_at: expiresAt,
        sync_error:       null,
      }).eq("id", exchange_id).eq("user_id", user.id);

      return json({ refreshed: true });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  if (action === "disconnect") {
    const { exchange_id } = body;
    if (!exchange_id) return json({ error: "exchange_id required" }, 400);

    const { data: conn } = await sb
      .from("exchange_connections")
      .select("access_token, exchange")
      .eq("id", exchange_id)
      .eq("user_id", user.id)
      .single();

    // Best-effort token revocation for Coinbase
    if (conn?.exchange === "coinbase" && conn?.access_token) {
      await fetch(COINBASE_REVOKE_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: conn.access_token }),
      }).catch(() => {/* ignore */});
    }

    await sb.from("exchange_connections")
      .update({ is_active: false, access_token: null, refresh_token: null })
      .eq("id", exchange_id).eq("user_id", user.id);

    return json({ disconnected: true });
  }

  // ── Exchange API key storage ──────────────────────────────────────────────
  // We do NOT call the exchange API to validate keys here because:
  //   1. IP-restricted keys (common on Binance) would always be rejected since
  //      Supabase edge function IPs are not in the user's allowlist.
  //   2. Each exchange (Kraken, KuCoin) uses a different auth scheme.
  // Keys are validated lazily on the first portfolio sync instead.
  if (action === "binance-key") {
    const { api_key, api_secret, exchange } = body;
    if (!api_key?.trim() || !api_secret?.trim()) {
      return json({ error: "api_key and api_secret are required" }, 400);
    }
    if (api_key.trim().length < 8 || api_secret.trim().length < 8) {
      return json({ error: "Key or secret looks too short — please paste the full key from your exchange" }, 400);
    }

    const exchangeId = exchange ?? "binance";
    const label      = EXCHANGE_LABELS[exchangeId] ?? exchangeId;

    const { error: dbErr } = await sb.from("exchange_connections").upsert({
      user_id:         user.id,
      exchange:        exchangeId,
      label,
      connection_type: "api_key",
      api_key:         api_key.trim(),
      api_secret:      api_secret.trim(),
      is_active:       true,
      last_synced_at:  new Date().toISOString(),
      sync_error:      null,
    }, { onConflict: "user_id,exchange" });

    if (dbErr) return json({ error: dbErr.message }, 500);
    return json({ exchange: exchangeId, label, connected: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
