/**
 * POST /api/advisor/reports — persist a diagnostic as a saved report.
 *
 * Server-side only, because the insert must pass the firm's monthly quota:
 * a browser with RLS insert rights could bypass billing. The advisor_reports
 * table deliberately has NO insert policy — this route (service role) is the
 * single write path.
 *
 * Flow: verify advisor session → ensure firm row (self-heals if missing,
 * see lib/advisor/ensure-firm.ts) → quota check → insert with denormalized
 * list fields + a downsampled sparkline → increment reports_this_month.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdvisorFirm } from "@/lib/advisor/ensure-firm";

interface WealthPoint {
  date: string;
  cumulative_in: number;
  cumulative_out: number;
  net_position: number;
}

/** Downsample the wealth path to ~24 points for a lightweight card preview. */
function buildSparkline(wealthPath: unknown): { date: string; net_position: number }[] | null {
  if (!Array.isArray(wealthPath) || wealthPath.length < 2) return null;
  const points = wealthPath as WealthPoint[];
  const target = 24;
  if (points.length <= target) {
    return points.map(p => ({ date: p.date, net_position: p.net_position }));
  }
  const step = (points.length - 1) / (target - 1);
  const out: { date: string; net_position: number }[] = [];
  for (let i = 0; i < target; i++) {
    const p = points[Math.round(i * step)];
    out.push({ date: p.date, net_position: p.net_position });
  }
  return out;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "advisor") {
    return NextResponse.json({ error: "advisor_only" }, { status: 403 });
  }

  let body: { diagnostic?: Record<string, unknown>; broker?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const d = body.diagnostic;
  if (!d || typeof d !== "object" || !d.client_label || !d.grades) {
    return NextResponse.json({ error: "missing_diagnostic" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── Firm (self-healing) + quota ───────────────────────────────────────────────
  const firmResult = await ensureAdvisorFirm(admin, user);
  if ("error" in firmResult) {
    return NextResponse.json({ error: firmResult.error }, { status: 500 });
  }

  const { data: firm, error: firmErr } = await admin
    .from("advisor_firms")
    .select("id, reports_this_month, report_limit_monthly")
    .eq("id", firmResult.firmId)
    .single();

  if (firmErr || !firm) {
    // Should be unreachable — ensureAdvisorFirm just confirmed the row exists.
    return NextResponse.json({ error: "firm_not_found" }, { status: 404 });
  }
  if (firm.reports_this_month >= firm.report_limit_monthly) {
    return NextResponse.json(
      { error: "quota_exceeded", limit: firm.report_limit_monthly },
      { status: 429 },
    );
  }

  // ── Insert with denormalized list-view fields ────────────────────────────────
  const grades  = d.grades as { overall?: string };
  const scoreV2 = d.score_v2 as { composite?: number } | null | undefined;

  const { data: report, error: insErr } = await admin
    .from("advisor_reports")
    .insert({
      firm_id:           firm.id,
      client_label:      String(d.client_label).slice(0, 200),
      broker:            body.broker ? String(body.broker).slice(0, 50) : null,
      currency:          String(d.currency ?? "USD").slice(0, 10),
      overall_grade:     grades?.overall ?? null,
      composite_score:   scoreV2?.composite ?? null,
      opportunity_cost:  (d.opportunity_cost_dollars as number | null) ?? null,
      transaction_count: (d.transaction_count as number | null) ?? null,
      period_start:      (d.period_start as string | null) ?? null,
      period_end:        (d.period_end as string | null) ?? null,
      sparkline:         buildSparkline(d.wealth_path),
      diagnostic:        d,
    })
    .select("id")
    .single();

  if (insErr || !report) {
    console.error("[advisor/reports] insert failed:", insErr?.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // ── Count against quota ──────────────────────────────────────────────────────
  await admin
    .from("advisor_firms")
    .update({ reports_this_month: firm.reports_this_month + 1 })
    .eq("id", firm.id);

  return NextResponse.json({
    ok: true,
    id: report.id,
    reports_used: firm.reports_this_month + 1,
    report_limit: firm.report_limit_monthly,
    healed: firmResult.healed,
  });
}
