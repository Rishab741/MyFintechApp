/**
 * compute-metrics — Supabase Edge Function
 *
 * Thin webhook receiver that forwards compute requests to the FastAPI
 * Portfolio Engine.  Called by two sources:
 *
 *   1. The `portfolio_snapshots_v2` INSERT trigger (via pg_net) — fires
 *      immediately after a new snapshot is normalised, keeping the
 *      performance_cache up to date in near-real-time.
 *
 *   2. The daily pg_cron job (04:00 UTC) — calls /sync/compute/all to
 *      recompute metrics for every user with data.
 *
 * The edge function acts as the bridge because:
 *   - It can read Deno environment variables (ENGINE_URL, ENGINE_SERVICE_KEY)
 *   - pg_net cannot read Supabase Vault secrets easily from a trigger
 *   - Having a single entry point makes it easy to add retry logic / logging
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ENGINE_URL         = Deno.env.get('ENGINE_URL')          ?? '';
const ENGINE_SERVICE_KEY = Deno.env.get('ENGINE_SERVICE_KEY')  ?? '';
const MAX_RETRIES        = 3;
const RETRY_DELAY_MS     = 1000;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ComputePayload {
  user_id?: string;  // present for single-user triggers; absent for nightly /all
  mode?:    'single' | 'all';
}

// ── HTTP helper with retry ─────────────────────────────────────────────────────
async function callEngine(
  path: string,
  attempt = 1,
): Promise<{ ok: boolean; body: unknown }> {
  try {
    const res = await fetch(`${ENGINE_URL}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ENGINE_SERVICE_KEY}`,
      },
      body: '{}',
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok && attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      return callEngine(path, attempt + 1);
    }

    return { ok: res.ok, body };
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      return callEngine(path, attempt + 1);
    }
    return { ok: false, body: { error: String(err) } };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Validate method
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate engine configuration
  if (!ENGINE_URL || !ENGINE_SERVICE_KEY) {
    console.error('compute-metrics: ENGINE_URL or ENGINE_SERVICE_KEY not set');
    return new Response(
      JSON.stringify({ error: 'Engine not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Parse payload
  let payload: ComputePayload = {};
  try {
    payload = await req.json();
  } catch {
    // Empty body is valid — treated as nightly /all call
  }

  const { user_id, mode } = payload;

  // Route to the correct engine endpoint
  let path: string;
  if (mode === 'all' || !user_id) {
    path = '/sync/compute/all';
  } else {
    path = `/sync/compute/${user_id}`;
  }

  console.log(`compute-metrics: calling engine at ${path}`);
  const result = await callEngine(path);

  if (!result.ok) {
    console.error('compute-metrics: engine call failed', result.body);
    return new Response(
      JSON.stringify({ error: 'Engine call failed', detail: result.body }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify(result.body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
