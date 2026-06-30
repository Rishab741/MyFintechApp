/**
 * run-scenario — Platstock Edge Function
 *
 * Creates a scenario_run record, forwards the simulation request to the
 * Python engine, and returns the run_id for the client to poll.
 *
 * POST /functions/v1/run-scenario
 * Body: { scenario_id, monthly_savings_assumption? }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENGINE_URL           = Deno.env.get("ENGINE_URL")!;
const ENGINE_SERVICE_KEY   = Deno.env.get("ENGINE_SERVICE_KEY")!;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userSb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error: authErr } = await userSb.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { scenario_id: string; monthly_savings_assumption?: number };
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body.scenario_id) return json({ error: "scenario_id required" }, 400);

  // ── Load scenario (validates ownership via user_id) ───────────────────────
  const { data: scenario, error: scErr } = await sb
    .from("scenarios")
    .select("*")
    .eq("id", body.scenario_id)
    .eq("user_id", user.id)
    .single();

  if (scErr || !scenario) return json({ error: "Scenario not found" }, 404);

  if (!scenario.comparison_assets?.length) {
    return json({ error: "Scenario has no comparison_assets configured" }, 400);
  }

  // ── Create scenario_run record ────────────────────────────────────────────
  const configSnapshot = {
    comparison_assets:            scenario.comparison_assets,
    period_start:                 scenario.period_start,
    period_end:                   scenario.period_end,
    initial_capital:              scenario.initial_capital,
    rebalancing_strategy:         scenario.rebalancing_strategy,
    apply_behavioral_adjustment:  scenario.apply_behavioral_adjustment,
    apply_dividend_reinvestment:  scenario.apply_dividend_reinvestment,
    run_monte_carlo:              scenario.run_monte_carlo,
  };

  const { data: run, error: runErr } = await sb
    .from("scenario_runs")
    .insert({
      scenario_id:     body.scenario_id,
      user_id:         user.id,
      status:          "queued",
      config_snapshot: configSnapshot,
    })
    .select("id")
    .single();

  if (runErr || !run) return json({ error: "Failed to create run record" }, 500);

  const runId = run.id as string;

  // ── Forward to Python engine (fire-and-forget) ────────────────────────────
  const enginePayload = {
    user_id:                     user.id,
    run_id:                      runId,
    comparison_assets:           scenario.comparison_assets,
    period_start:                scenario.period_start   ?? null,
    period_end:                  scenario.period_end     ?? null,
    initial_capital:             scenario.initial_capital ?? null,
    rebalancing_strategy:        scenario.rebalancing_strategy ?? "hold",
    apply_behavioral_adjustment: scenario.apply_behavioral_adjustment ?? true,
    apply_dividend_reinvestment: scenario.apply_dividend_reinvestment ?? true,
    run_monte_carlo:             scenario.run_monte_carlo ?? false,
    monthly_savings_assumption:  body.monthly_savings_assumption ?? 1000,
  };

  try {
    const engineRes = await fetch(`${ENGINE_URL}/v1/simulate/scenario`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${ENGINE_SERVICE_KEY}`,
      },
      body: JSON.stringify(enginePayload),
    });

    if (!engineRes.ok) {
      const detail = await engineRes.text().catch(() => "");
      console.error("Engine rejected scenario:", detail);
      await sb.from("scenario_runs").update({
        status:        "failed",
        error_message: `Engine error ${engineRes.status}: ${detail}`.slice(0, 500),
        completed_at:  new Date().toISOString(),
      }).eq("id", runId);
      return json({ error: "Engine rejected the request", run_id: runId }, 502);
    }

    const { job_id } = await engineRes.json();

    // Update run with engine job id
    await sb.from("scenario_runs").update({ engine_job_id: job_id }).eq("id", runId);

    // Update scenario last_run_at
    await sb.from("scenarios").update({ last_run_at: new Date().toISOString() })
      .eq("id", body.scenario_id);

    return json({ run_id: runId, job_id, status: "queued" });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb.from("scenario_runs").update({
      status:        "failed",
      error_message: msg.slice(0, 500),
      completed_at:  new Date().toISOString(),
    }).eq("id", runId);
    return json({ error: `Engine unreachable: ${msg}`, run_id: runId }, 503);
  }
});
