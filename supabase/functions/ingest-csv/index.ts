/**
 * ingest-csv — Platstock Edge Function
 *
 * Two-step bridge to the Python engine for universal CSV/XLSX import:
 *
 *   POST /functions/v1/ingest-csv/parse
 *     Body: FormData { file: File }
 *     Returns: { columns, preview_rows, row_count, detected_map }
 *
 *   POST /functions/v1/ingest-csv/import
 *     Body: FormData { file: File, mapping: JSON string }
 *     Returns: { inserted, skipped, errors }
 *     Also writes a csv_import_jobs record for history.
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

async function getUser(authHeader: string) {
  if (!authHeader.startsWith("Bearer ")) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  return error ? null : user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  const user = await getUser(authHeader);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const url     = new URL(req.url);
  const action  = url.pathname.split("/").pop(); // "parse" or "import"

  // ── Forward multipart FormData directly to the engine ────────────────────
  let enginePath: string;
  if (action === "parse") {
    enginePath = "/v1/ingest/parse-columns";
  } else if (action === "import") {
    enginePath = "/v1/ingest/universal";
  } else {
    return json({ error: `Unknown action: ${action}. Use /parse or /import` }, 400);
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) return json({ error: "Expected multipart/form-data" }, 400);

  try {
    const engineRes = await fetch(`${ENGINE_URL}${enginePath}`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${ENGINE_SERVICE_KEY}` },
      body:    formData,
    });

    const result = await engineRes.json().catch(() => ({}));

    if (!engineRes.ok) {
      return json({ error: "Engine error", detail: result }, engineRes.status);
    }

    // ── For imports, persist a history record ─────────────────────────────
    if (action === "import") {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const file     = formData.get("file") as File | null;
      const mappingRaw = formData.get("mapping") as string | null;

      const inserted    = result.inserted ?? 0;
      const skipped     = result.skipped  ?? 0;
      const errorCount  = (result.errors ?? []).length;

      await sb.from("csv_import_jobs").insert({
        user_id:        user.id,
        file_name:      file?.name ?? "upload",
        row_count:      inserted + skipped + errorCount,
        inserted,
        skipped,
        error_count:    errorCount,
        errors:         result.errors ?? [],
        status:         errorCount > 0 && inserted === 0 ? "failed"
                      : errorCount > 0                   ? "partial"
                      :                                    "complete",
        column_mapping: mappingRaw ? JSON.parse(mappingRaw) : null,
      });
    }

    return json(result);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ingest-csv error:", msg);
    return json({ error: "Engine unreachable", detail: msg }, 503);
  }
});
