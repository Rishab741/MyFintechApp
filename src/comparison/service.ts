import { supabase } from "@/src/lib/supabase";
import type {
  BehavioralProfile,
  ComparisonAsset,
  CreateScenarioInput,
  Scenario,
  ScenarioRun,
} from "./types";

// Resolved once at module load from the already-substituted env var.
// Never read process.env at call time — Babel replaces it at build time only.
const SUPABASE_FUNCTIONS_URL =
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "") + "/functions/v1";

// ── Scenarios ─────────────────────────────────────────────────────────────────

export async function listScenarios(): Promise<Scenario[]> {
  // Order by updated_at (exposed after migration 20260609000001).
  // Falls back to created_at on older deployments where updated_at is missing from the view.
  const { data, error } = await supabase
    .from("query_scenarios")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Scenario[];
}

export async function createScenario(input: CreateScenarioInput): Promise<Scenario> {
  // getSession() reads the local JWT — no network round-trip, never fails silently.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error("Not authenticated — please sign out and sign back in");

  const { data, error } = await supabase
    .from("scenarios")
    .insert({ ...input, user_id: session.user.id })
    .select("*")
    .single();

  if (error) {
    // Surface the full Supabase error so it appears in both the alert and console
    console.error("[createScenario] Supabase error:", JSON.stringify(error));
    throw new Error(error.message);
  }
  return data as Scenario;
}

export async function updateScenario(
  id: string,
  input: Partial<CreateScenarioInput>,
): Promise<Scenario> {
  const { data, error } = await supabase
    .from("scenarios")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Scenario;
}

export async function deleteScenario(id: string): Promise<void> {
  const { error } = await supabase.from("scenarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleBookmark(id: string, bookmarked: boolean): Promise<void> {
  const { error } = await supabase
    .from("scenarios")
    .update({ is_bookmarked: bookmarked })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Run & poll ────────────────────────────────────────────────────────────────

export async function runScenario(
  scenarioId: string,
  monthlySavingsAssumption = 1000,
): Promise<{ run_id: string; job_id: string }> {
  const { data, error } = await supabase.functions.invoke<{
    run_id: string;
    job_id: string;
    status: string;
  }>("run-scenario", {
    body: {
      scenario_id:                scenarioId,
      monthly_savings_assumption: monthlySavingsAssumption,
    },
  });
  if (error) throw new Error(error.message ?? "Failed to start scenario run");
  if (!data?.run_id) throw new Error("No run_id returned from engine");
  return { run_id: data.run_id, job_id: data.job_id };
}

export async function pollScenario(runId: string): Promise<ScenarioRun> {
  // functions.invoke does not forward query params to the edge function.
  // The poll-scenario function reads run_id from url.searchParams, so we
  // must use a direct fetch with the param in the URL.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const url = `${SUPABASE_FUNCTIONS_URL}/poll-scenario?run_id=${encodeURIComponent(runId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "apikey": process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "unknown error");
    throw new Error(`poll-scenario ${res.status}: ${detail}`);
  }

  const payload = await res.json() as ScenarioRun & { error?: string };

  // Edge function can return HTTP 200 with an error field in the body
  if (payload.error) throw new Error(payload.error);

  return payload;
}

// ── Asset universe ────────────────────────────────────────────────────────────

export async function fetchAssetUniverse(): Promise<ComparisonAsset[]> {
  const { data, error } = await supabase
    .from("comparison_asset_universe")
    .select("symbol, name, asset_class, sector, exchange, currency, is_featured, description")
    .order("is_featured", { ascending: false })
    .order("symbol", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ComparisonAsset[];
}

export async function searchAssets(query: string): Promise<ComparisonAsset[]> {
  const q = query.trim();
  if (!q) return fetchAssetUniverse();

  const COLS = "symbol, name, asset_class, sector, exchange, currency, is_featured, description";

  // Run symbol and name searches separately — using .or() with % wildcards causes
  // double URL-encoding (%25) in PostgREST, making the wildcards literal characters.
  const [{ data: bySymbol }, { data: byName }] = await Promise.all([
    supabase
      .from("comparison_asset_universe")
      .select(COLS)
      .ilike("symbol", `%${q}%`)
      .order("is_featured", { ascending: false })
      .limit(20),
    supabase
      .from("comparison_asset_universe")
      .select(COLS)
      .ilike("name", `%${q}%`)
      .order("is_featured", { ascending: false })
      .limit(20),
  ]);

  // Merge and deduplicate by symbol; featured rows sort first naturally
  const seen = new Set<string>();
  const results: ComparisonAsset[] = [];
  for (const row of [...(bySymbol ?? []), ...(byName ?? [])]) {
    if (!seen.has(row.symbol)) {
      seen.add(row.symbol);
      results.push(row as ComparisonAsset);
    }
  }
  return results.slice(0, 30);
}

// ── Behavioral profile ────────────────────────────────────────────────────────

export async function fetchBehavioralProfile(): Promise<BehavioralProfile | null> {
  const { data, error } = await supabase
    .from("query_behavioral_profile")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BehavioralProfile | null;
}

export async function triggerProfileRebuild(): Promise<void> {
  const { error } = await supabase.functions.invoke("build-behavioral-profile", {
    body: {},
  });
  if (error) throw new Error(error.message ?? "Failed to trigger profile rebuild");
}
