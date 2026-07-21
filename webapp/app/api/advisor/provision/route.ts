/**
 * POST /api/advisor/provision
 *
 * Server-side advisor provisioning that does NOT depend on the email-link
 * redirect reaching /auth/advisor-callback. Called by:
 *   - the advisor signup page, when Supabase returns an immediate session
 *     (email confirmations disabled / auto-confirm);
 *   - the advisor login page, when a signed-in user has no role yet;
 *   - any advisor-only route that hits a missing-firm error, as a self-heal.
 *
 * Idempotency contract: "already provisioned" means role=advisor AND a firm
 * row exists — NOT role=advisor alone. Trusting the role alone was the bug:
 * if role got set but the firm insert failed, this endpoint used to report
 * success forever without ever creating the missing row. ensureAdvisorFirm
 * is now the single source of truth for "does this account have a firm".
 *
 * Security:
 *   - Caller must hold a valid session (cookie-based getUser()).
 *   - Email must be confirmed — preserves the verification gate when enabled.
 *   - Accounts with no role yet must carry firm_name in user_metadata (i.e.
 *     came through the advisor signup wizard) before a role is granted.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdvisorFirm } from "@/lib/advisor/ensure-firm";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Never touch an account holding a different role (e.g. admin).
  const role = user.app_metadata?.role;
  if (role && role !== "advisor") {
    return NextResponse.json({ error: "role_conflict" }, { status: 409 });
  }

  const admin = createAdminClient();

  // ── Already an advisor: just make sure the firm row is actually there ──────
  if (role === "advisor") {
    const result = await ensureAdvisorFirm(admin, user);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, already_provisioned: true, healed: result.healed });
  }

  // ── No role yet: this must be a fresh advisor signup ────────────────────────
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "email_unverified" }, { status: 403 });
  }

  const firmName = String(user.user_metadata?.firm_name ?? "").trim();
  if (firmName.length < 2) {
    return NextResponse.json({ error: "not_advisor_signup" }, { status: 400 });
  }

  // Create the firm FIRST, then grant the role — so "has advisor role" always
  // implies "has a firm row" as an invariant, instead of the two being able
  // to drift apart if one write fails.
  const result = await ensureAdvisorFirm(admin, user);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const ip = (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
  const ua = request.headers.get("user-agent") ?? null;

  const { error: roleErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: "advisor" },
  });

  if (roleErr) {
    console.error("[advisor/provision] role update failed:", roleErr.message);
    await admin.from("advisor_audit_log").insert({
      firm_id:    result.firmId,
      event:      "PROVISION_FAILED",
      ip_address: ip,
      user_agent: ua,
      metadata:   { reason: "app_metadata_update_failed", error: roleErr.message },
    });
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });
  }

  await admin.from("advisor_audit_log").insert({
    firm_id:    result.firmId,
    event:      "ADVISOR_SIGNED_UP",
    ip_address: ip,
    user_agent: ua,
    metadata:   { email: user.email, firm_name: firmName, via: "provision_api" },
  });

  return NextResponse.json({ ok: true });
}
