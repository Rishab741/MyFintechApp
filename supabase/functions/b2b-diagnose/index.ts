/**
 * b2b-diagnose — Platstock B2B RIA Diagnostic
 *
 * Public endpoint (no Supabase auth required).  Advisors upload a client's
 * brokerage CSV export and receive a full behavioral + institutional diagnostic
 * in a single response.  Nothing is persisted — all computation is ephemeral.
 *
 * POST /functions/v1/b2b-diagnose
 * Content-Type: multipart/form-data
 * Fields:
 *   file         — CSV export from the client's brokerage
 *   broker       — 'schwab' | 'fidelity' | 'csv_generic'   (default: csv_generic)
 *   firm_name    — advisor firm name for report header      (default: 'Advisor')
 *   client_label — anonymised client label                  (default: 'Client Portfolio')
 */

const ENGINE_URL         = Deno.env.get("ENGINE_URL")!;
const ENGINE_SERVICE_KEY = Deno.env.get("ENGINE_SERVICE_KEY")!;

// Allow any origin so advisors can embed this in their own tools.
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")   return err("Method not allowed", 405);

  // ── Parse multipart ─────────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return err("Expected multipart/form-data with a 'file' field.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return err("Missing 'file' field — attach the brokerage CSV export.");
  }

  const broker      = (formData.get("broker")       as string | null) ?? "csv_generic";
  const firmName    = (formData.get("firm_name")    as string | null) ?? "Advisor";
  const clientLabel = (formData.get("client_label") as string | null) ?? "Client Portfolio";

  // ── Forward to Python engine (multipart passthrough) ────────────────────────
  const engineForm = new FormData();
  engineForm.append("file", file, file.name);
  engineForm.append("broker",        broker);
  engineForm.append("firm_name",     firmName);
  engineForm.append("client_label",  clientLabel);

  let engineRes: Response;
  try {
    engineRes = await fetch(`${ENGINE_URL}/v1/b2b/diagnose-csv`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${ENGINE_SERVICE_KEY}` },
      body:    engineForm,
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error("b2b-diagnose: engine unreachable:", msg);
    return err("Diagnostic engine unavailable. Please try again shortly.", 503);
  }

  if (!engineRes.ok) {
    const detail = await engineRes.text().catch(() => "");
    console.error("b2b-diagnose: engine returned", engineRes.status, detail);
    return err(`Analysis failed: ${detail || engineRes.statusText}`, engineRes.status);
  }

  // ── Stream engine response straight to caller ────────────────────────────────
  const diagnostic = await engineRes.json();
  return json(diagnostic);
});
