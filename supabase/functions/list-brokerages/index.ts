/**
 * list-brokerages — Vestara Edge Function
 *
 * Returns the full catalogue of brokerages Platstock can connect to.
 * Sources: SnapTrade /brokerages + our brokerage_catalogue table.
 *
 * GET /functions/v1/list-brokerages
 *   Returns { brokerages: BrokerageCatalogueItem[], total: number }
 *
 * Caching strategy:
 *   - SnapTrade list is fetched live and upserted into brokerage_catalogue
 *   - Subsequent calls read from the DB (fast, no external latency)
 *   - ?refresh=1 forces a live fetch from SnapTrade
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SNAPTRADE_CLIENT_ID  = Deno.env.get("SNAPTRADE_CLIENT_ID")!;
const SNAPTRADE_CONSUMER_KEY = Deno.env.get("SNAPTRADE_CONSUMER_KEY")!;
const SNAPTRADE_BASE       = "https://api.snaptrade.com/api/v1";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── SnapTrade request signing ─────────────────────────────────────────────────
async function snapTradeSign(path: string, query: string, content: unknown): Promise<string> {
  const sigContent = JSON.stringify({ content, path, query });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(encodeURI(SNAPTRADE_CONSUMER_KEY)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sigContent));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function snapTradeGet(path: string): Promise<{ status: number; data: unknown }> {
  const ts    = Math.floor(Date.now() / 1000).toString();
  const query = `clientId=${SNAPTRADE_CLIENT_ID}&timestamp=${ts}`;
  const sig   = await snapTradeSign(`/api/v1${path}`, query, null);
  const res   = await fetch(`${SNAPTRADE_BASE}${path}?${query}`, {
    headers: {
      "Content-Type": "application/json",
      "clientId":     SNAPTRADE_CLIENT_ID,
      "timestamp":    ts,
      "Signature":    sig,
    },
  });
  return { status: res.status, data: await res.json() };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET")     return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user } } = await sb.auth.getUser(authHeader.slice(7));
  if (!user) return json({ error: "Unauthorized" }, 401);

  const url     = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";

  // ── Try DB cache first ────────────────────────────────────────────────────
  if (!refresh) {
    const { data: cached, error } = await sb
      .from("brokerage_catalogue")
      .select("slug, name, logo_url, url, primary_color, description, account_types, is_crypto, is_featured, display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (!error && cached && cached.length > 0) {
      return json({ brokerages: cached, total: cached.length, source: "cache" });
    }
  }

  // ── Fetch from SnapTrade ──────────────────────────────────────────────────
  try {
    const { status, data } = await snapTradeGet("/brokerages");
    if (status !== 200 || !Array.isArray(data)) {
      throw new Error(`SnapTrade returned ${status}`);
    }

    // Upsert into catalogue
    const rows = (data as any[]).map((b: any, i: number) => ({
      slug:          b.slug ?? b.id ?? String(i),
      name:          b.name ?? b.full_name ?? "Unknown",
      logo_url:      b.square_logo_url ?? b.logo_url ?? null,
      url:           b.url ?? null,
      primary_color: b.primary_color ?? null,
      description:   b.description ?? null,
      account_types: b.account_types ?? [],
      is_crypto:     b.name?.toLowerCase().includes("coin") || b.name?.toLowerCase().includes("crypto") || false,
      is_featured:   false,
      display_order: 100 + i,
    }));

    // Upsert without overwriting is_featured / display_order we set manually
    await sb.from("brokerage_catalogue").upsert(rows, {
      onConflict:        "slug",
      ignoreDuplicates:  false,
    });

    // Read back the full merged list (includes our hand-curated is_featured flags)
    const { data: merged } = await sb
      .from("brokerage_catalogue")
      .select("slug, name, logo_url, url, primary_color, description, account_types, is_crypto, is_featured, display_order")
      .order("is_featured", { ascending: false })
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    return json({ brokerages: merged ?? rows, total: (merged ?? rows).length, source: "live" });

  } catch (err) {
    // SnapTrade unreachable — fall back to DB catalogue
    const { data: fallback } = await sb
      .from("brokerage_catalogue")
      .select("*")
      .order("display_order");

    if (fallback?.length) {
      return json({ brokerages: fallback, total: fallback.length, source: "fallback" });
    }

    return json({ error: "Failed to fetch brokerages", detail: String(err) }, 502);
  }
});
