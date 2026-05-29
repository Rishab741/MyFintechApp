/**
 * build-behavioral-profile — Vestara Edge Function
 *
 * Triggers the Python engine to rebuild the BTF profile for a given user.
 * Called by:
 *   1. The transactions INSERT trigger (via pg_net) — keeps profile fresh
 *   2. Direct call from the client (first-time profile build)
 *
 * POST /functions/v1/build-behavioral-profile
 * Body: { user_id? }  — defaults to the authenticated user
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENGINE_URL           = Deno.env.get("ENGINE_URL")!;
const ENGINE_SERVICE_KEY   = Deno.env.get("ENGINE_SERVICE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  let targetUserId: string;

  const authHeader = req.headers.get("authorization") ?? "";

  // ── Service-role call (from pg_net trigger) ───────────────────────────────
  // Body contains { user_id } and auth header carries the service role key.
  if (authHeader === `Bearer ${SUPABASE_SERVICE_KEY}`) {
    let body: { user_id?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    if (!body.user_id) return json({ error: "user_id required for service calls" }, 400);
    targetUserId = body.user_id;
  } else {
    // ── User call ───────────────────────────────────────────────────────────
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
    if (error || !user) return json({ error: "Unauthorized" }, 401);
    targetUserId = user.id;
  }

  // ── Forward to engine ─────────────────────────────────────────────────────
  try {
    const res = await fetch(`${ENGINE_URL}/v1/simulate/behavioral-profile`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${ENGINE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ user_id: targetUserId }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Engine behavioral-profile error:", detail);
      return json({ error: "Engine error", detail }, 502);
    }

    const result = await res.json();
    return json({ status: "ok", user_id: targetUserId, ...result });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("build-behavioral-profile: engine unreachable:", msg);
    // Non-fatal — triggered by a DB trigger so we swallow silently
    return json({ status: "skipped", reason: msg });
  }
});
