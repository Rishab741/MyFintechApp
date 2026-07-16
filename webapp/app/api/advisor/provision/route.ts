/**
 * POST /api/advisor/provision
 *
 * Server-side advisor provisioning that does NOT depend on the email-link
 * redirect reaching /auth/advisor-callback. Called by:
 *   - the advisor signup page, when Supabase returns an immediate session
 *     (email confirmations disabled / auto-confirm);
 *   - the advisor login page, when a signed-in user has no role but their
 *     user_metadata carries an advisor signup profile (the email link fell
 *     back to the site root because the callback URL wasn't allow-listed).
 *
 * Security:
 *   - Caller must hold a valid session (cookie-based getUser()).
 *   - Email must be confirmed — preserves the verification gate when enabled.
 *   - firm_name must exist in user_metadata (i.e. this was an advisor signup).
 *   - Fully idempotent; never touches accounts that already have a role.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Already provisioned — nothing to do.
  if (user.app_metadata?.role === "advisor") {
    return NextResponse.json({ ok: true, already_provisioned: true });
  }

  // Never convert an account that holds a different role (e.g. admin).
  if (user.app_metadata?.role) {
    return NextResponse.json({ error: "role_conflict" }, { status: 409 });
  }

  // Preserve the email-verification gate when confirmations are enabled.
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "email_unverified" }, { status: 403 });
  }

  // Only accounts created through the advisor signup wizard carry firm_name.
  const meta      = user.user_metadata ?? {};
  const firmName  = String(meta.firm_name ?? "").trim().slice(0, 200);
  if (firmName.length < 2) {
    return NextResponse.json({ error: "not_advisor_signup" }, { status: 400 });
  }

  const firmType  = String(meta.firm_type  ?? "").trim().slice(0, 100);
  const aumRange  = String(meta.aum_range  ?? "").trim().slice(0, 50);
  const teamSize  = String(meta.team_size  ?? "").trim().slice(0, 50);
  const firstName = String(meta.contact_first_name ?? "").trim().slice(0, 100);
  const lastName  = String(meta.contact_last_name  ?? "").trim().slice(0, 100);
  const jobTitle  = String(meta.job_title  ?? "").trim().slice(0, 200);
  const useCase   = String(meta.primary_use_case   ?? "").trim().slice(0, 100);

  const admin = createAdminClient();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const ua = request.headers.get("user-agent") ?? null;

  // ── Firm row (idempotent) ─────────────────────────────────────────────────
  const { data: existing } = await admin
    .from("advisor_firms")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  let firmId = existing?.id as string | undefined;

  if (!firmId) {
    const { data: firm, error: firmErr } = await admin
      .from("advisor_firms")
      .insert({
        user_id:                 user.id,
        email:                   user.email!,
        firm_name:               firmName,
        firm_type:               firmType  || null,
        aum_range:               aumRange  || null,
        team_size:               teamSize  || null,
        contact_first_name:      firstName || null,
        contact_last_name:       lastName  || null,
        job_title:               jobTitle  || null,
        primary_use_case:        useCase   || null,
        onboarding_completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (firmErr || !firm) {
      console.error("[advisor/provision] firm insert failed:", firmErr?.message);
      return NextResponse.json({ error: "firm_creation_failed" }, { status: 500 });
    }
    firmId = firm.id;
  }

  // ── Role claim (the security-relevant write) ──────────────────────────────
  const { error: roleErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: "advisor" },
  });

  if (roleErr) {
    console.error("[advisor/provision] role update failed:", roleErr.message);
    await admin.from("advisor_audit_log").insert({
      firm_id:    firmId,
      event:      "PROVISION_FAILED",
      ip_address: ip,
      user_agent: ua,
      metadata:   { reason: "app_metadata_update_failed", error: roleErr.message },
    });
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });
  }

  await admin.from("advisor_audit_log").insert({
    firm_id:    firmId,
    event:      "ADVISOR_SIGNED_UP",
    ip_address: ip,
    user_agent: ua,
    metadata:   { email: user.email, firm_name: firmName, via: "provision_api" },
  });

  return NextResponse.json({ ok: true });
}
