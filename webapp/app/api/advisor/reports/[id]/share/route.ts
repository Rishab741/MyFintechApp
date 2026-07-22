/**
 * POST   /api/advisor/reports/[id]/share — create (or return existing) a
 *        client-facing share link for a saved report.
 * DELETE /api/advisor/reports/[id]/share — revoke it.
 *
 * Authenticated, ownership-checked: the report must belong to the caller's
 * own firm. This route only ever touches share_* columns and never returns
 * the full `diagnostic` — the public link it creates is served exclusively
 * by /api/share/[token], which reads `prospect_snapshot`, never `diagnostic`.
 */

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

async function loadOwnedReport(admin: ReturnType<typeof createAdminClient>, reportId: string, firmId: string) {
  return admin
    .from("advisor_reports")
    .select("id, firm_id, share_token, share_revoked_at, share_expires_at, share_view_count, client_label")
    .eq("id", reportId)
    .eq("firm_id", firmId)
    .maybeSingle();
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "advisor") {
    return NextResponse.json({ error: "advisor_only" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: firm } = await admin
    .from("advisor_firms")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!firm) {
    return NextResponse.json({ error: "firm_not_found" }, { status: 404 });
  }

  const { data: report, error: loadErr } = await loadOwnedReport(admin, id, firm.id);
  if (loadErr || !report) {
    return NextResponse.json({ error: "report_not_found" }, { status: 404 });
  }

  let body: { regenerate?: boolean; expiresInDays?: number | null } = {};
  try { body = await request.json(); } catch { /* body optional */ }

  // Idempotent by default: an existing, non-revoked, non-expired link is
  // just returned as-is rather than silently rotated out from under the
  // advisor (they may have already sent it to the prospect).
  const now = new Date();
  const stillValid =
    report.share_token &&
    !report.share_revoked_at &&
    (!report.share_expires_at || new Date(report.share_expires_at) > now);

  if (stillValid && !body.regenerate) {
    return NextResponse.json({
      ok: true,
      token: report.share_token,
      expires_at: report.share_expires_at,
      view_count: report.share_view_count,
    });
  }

  const token = generateToken();
  const expiresAt = body.expiresInDays
    ? new Date(now.getTime() + body.expiresInDays * 86_400_000).toISOString()
    : null;

  const { error: updErr } = await admin
    .from("advisor_reports")
    .update({
      share_token:          token,
      share_created_at:     now.toISOString(),
      share_expires_at:     expiresAt,
      share_revoked_at:     null,
      share_view_count:     0,
      share_last_viewed_at: null,
    })
    .eq("id", id);

  if (updErr) {
    console.error("[share] create failed:", updErr.message);
    return NextResponse.json({ error: "share_create_failed" }, { status: 500 });
  }

  await admin.from("advisor_audit_log").insert({
    firm_id:  firm.id,
    event:    "SHARE_LINK_CREATED",
    metadata: { report_id: id, client_label: report.client_label, expires_at: expiresAt },
  });

  return NextResponse.json({ ok: true, token, expires_at: expiresAt, view_count: 0 });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "advisor") {
    return NextResponse.json({ error: "advisor_only" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: firm } = await admin
    .from("advisor_firms")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!firm) {
    return NextResponse.json({ error: "firm_not_found" }, { status: 404 });
  }

  const { data: report, error: loadErr } = await loadOwnedReport(admin, id, firm.id);
  if (loadErr || !report) {
    return NextResponse.json({ error: "report_not_found" }, { status: 404 });
  }

  await admin
    .from("advisor_reports")
    .update({ share_revoked_at: new Date().toISOString() })
    .eq("id", id);

  await admin.from("advisor_audit_log").insert({
    firm_id:  firm.id,
    event:    "SHARE_LINK_REVOKED",
    metadata: { report_id: id, client_label: report.client_label },
  });

  return NextResponse.json({ ok: true });
}
