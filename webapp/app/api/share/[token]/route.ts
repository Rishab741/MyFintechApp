/**
 * GET /api/share/[token] — public, unauthenticated.
 *
 * The ONLY server-side path that serves client-facing report data. Reads via
 * the service-role client deliberately — there is no anon RLS policy granting
 * access to advisor_reports, so the only way to reach this data at all is
 * through this route, which:
 *
 *   - selects `prospect_snapshot` and nothing else content-bearing (never
 *     `diagnostic`, never firm-internal columns)
 *   - refuses revoked or expired links
 *   - tracks a view count / last-viewed timestamp for the advisor's own
 *     record of when a prospect actually opened it
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: report, error } = await admin
    .from("advisor_reports")
    .select("id, firm_id, prospect_snapshot, report_template_version, share_revoked_at, share_expires_at, share_view_count")
    .eq("share_token", token)
    .maybeSingle();

  if (error || !report || !report.prospect_snapshot) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (report.share_revoked_at) {
    return NextResponse.json({ error: "revoked" }, { status: 410 });
  }
  if (report.share_expires_at && new Date(report.share_expires_at) <= new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // Best-effort view tracking — never block the response on this write.
  void admin
    .from("advisor_reports")
    .update({
      share_view_count:     report.share_view_count + 1,
      share_last_viewed_at: new Date().toISOString(),
    })
    .eq("id", report.id)
    .then(undefined, () => {});

  return NextResponse.json({
    ok: true,
    diagnostic:       report.prospect_snapshot,
    template_version: report.report_template_version,
  });
}
