/**
 * /auth/advisor-callback
 *
 * Handles the email-verification link for advisor sign-ups.
 * This is where app_metadata.role = "advisor" is set (also reachable via
 * the self-heal path in /api/advisor/provision, for accounts whose email
 * link never reached this route).
 *
 * Security guarantees:
 *   1. Code exchange happens server-side — the raw token never touches the browser.
 *   2. Admin client (service role) is used exclusively to set app_metadata.
 *      Users cannot forge this field via the client SDK.
 *   3. firm_name is read from user_metadata (set at signup) — it is not a trust
 *      boundary; only the role in app_metadata is the security claim.
 *   4. The firm row is created FIRST, then the role is granted — so "has
 *      advisor role" always implies "has a firm row." Setting the role first
 *      (the previous ordering) let the two drift apart if the firm insert
 *      failed after the role write succeeded, leaving the account stuck with
 *      a role but no firm. ensureAdvisorFirm makes both this route and the
 *      self-heal path share one code path for "does this account have a firm."
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAdvisorFirm } from "@/lib/advisor/ensure-firm";

function redirectTo(origin: string, path: string) {
  return NextResponse.redirect(`${origin}${path}`);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code      = searchParams.get("code");
  const linkError = searchParams.get("error");

  // Supabase sends ?error= on an expired or already-used link.
  if (linkError) {
    return redirectTo(origin, `/advisor/login?error=${encodeURIComponent("Verification link expired. Please sign in to request a new one.")}`);
  }

  if (!code) {
    return redirectTo(origin, "/advisor/login?error=missing_code");
  }

  // ── 1. Exchange code for session (sets auth cookies) ─────────────────────
  const supabase = await createClient();
  const { error: codeErr } = await supabase.auth.exchangeCodeForSession(code);

  if (codeErr) {
    console.error("[advisor-callback] code exchange failed:", codeErr.message);
    return redirectTo(origin, "/advisor/login?error=callback_failed");
  }

  // ── 2. Get the now-authenticated user ────────────────────────────────────
  // getUser() makes a network call to Supabase to verify the token is still
  // valid — more reliable than getSession() which only decodes the local JWT.
  const { data: { user }, error: userErr } = await supabase.auth.getUser();

  if (userErr || !user) {
    console.error("[advisor-callback] getUser failed:", userErr?.message);
    return redirectTo(origin, "/advisor/login?error=no_user");
  }

  // ── 3. Idempotency: already fully provisioned (role + firm)? ──────────────
  const admin = createAdminClient();

  if (user.app_metadata?.role === "advisor") {
    // Re-click of the email link — still verify the firm row exists.
    const result = await ensureAdvisorFirm(admin, user);
    if ("error" in result) {
      return redirectTo(origin, "/advisor/login?error=provision_failed");
    }
    return redirectTo(origin, "/advisor/dashboard");
  }

  // ── 4. Fresh sign-up: firm_name must be present (came from the wizard) ────
  const firmName = String(user.user_metadata?.firm_name ?? "").trim();
  if (firmName.length < 2) {
    console.error("[advisor-callback] missing firm_name for user:", user.id);
    return redirectTo(origin, "/advisor/signup?error=missing_firm_name");
  }

  // ── 5. Create the firm FIRST ───────────────────────────────────────────────
  const firmResult = await ensureAdvisorFirm(admin, user);
  if ("error" in firmResult) {
    console.error("[advisor-callback] firm provisioning failed:", firmResult.error);
    return redirectTo(origin, "/advisor/signup?error=firm_creation_failed");
  }

  // ── 6. Grant the role LAST — the invariant this ordering protects ─────────
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
    console.error("[advisor-callback] app_metadata update failed:", roleErr.message);
    await admin.from("advisor_audit_log").insert({
      firm_id:    firmResult.firmId,
      event:      "PROVISION_FAILED",
      ip_address: ip,
      user_agent: ua,
      metadata:   { reason: "app_metadata_update_failed", error: roleErr.message, user_id: user.id },
    });
    // The firm row exists even though the role write failed — the next
    // sign-in attempt (or a manual retry) will grant the role without
    // re-creating the firm, because ensureAdvisorFirm is idempotent.
    return redirectTo(origin, "/advisor/login?error=provision_failed");
  }

  await admin.from("advisor_audit_log").insert({
    firm_id:    firmResult.firmId,
    event:      "ADVISOR_SIGNED_UP",
    ip_address: ip,
    user_agent: ua,
    metadata:   { email: user.email, firm_name: firmName },
  });

  return redirectTo(origin, "/advisor/dashboard");
}
