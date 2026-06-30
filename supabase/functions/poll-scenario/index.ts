/**
 * poll-scenario — Platstock Edge Function
 *
 * Returns the current status and (when complete) full results for a scenario run.
 *
 * GET /functions/v1/poll-scenario?run_id=<uuid>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  Deno.env.get("ALLOWED_ORIGIN") ?? "https://platstock.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET")     return json({ error: "Method not allowed" }, 405);

  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userSb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await userSb.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── Resolve run_id ────────────────────────────────────────────────────────
  const url    = new URL(req.url);
  const run_id = url.searchParams.get("run_id");
  if (!run_id) return json({ error: "run_id query param required" }, 400);

  // ── Fetch run (ownership validated by user_id) ────────────────────────────
  const { data: run, error: runErr } = await sb
    .from("scenario_runs")
    .select("id, status, engine_job_id, error_message, started_at, completed_at, scenario_id")
    .eq("id", run_id)
    .eq("user_id", user.id)
    .single();

  if (runErr || !run) return json({ error: "Run not found" }, 404);

  const base = {
    run_id:       run.id,
    status:       run.status,
    started_at:   run.started_at,
    completed_at: run.completed_at,
    error:        run.error_message ?? null,
  };

  if (run.status !== "complete") {
    return json(base);
  }

  // ── Fetch results ─────────────────────────────────────────────────────────
  const { data: result, error: resErr } = await sb
    .from("scenario_results")
    .select("timeseries, metrics, decision_tree, inflection_points, temporal_opportunity, behavioral_profile_snapshot, monte_carlo, computation_ms, data_quality_score, expires_at")
    .eq("run_id", run_id)
    .single();

  if (resErr || !result) {
    // Results may not be written yet — return complete status without data
    return json({ ...base, results: null });
  }

  // Check expiry
  if (result.expires_at && new Date(result.expires_at) < new Date()) {
    return json({ ...base, status: "expired", results: null });
  }

  return json({
    ...base,
    results: {
      timeseries:               result.timeseries,
      metrics:                  result.metrics,
      decision_tree:            result.decision_tree,
      inflection_points:        result.inflection_points,
      temporal_opportunity:     result.temporal_opportunity,
      behavioral_profile:       result.behavioral_profile_snapshot,
      monte_carlo:              result.monte_carlo ?? null,
      computation_ms:           result.computation_ms,
      data_quality_score:       result.data_quality_score,
      expires_at:               result.expires_at,
    },
  });
});
