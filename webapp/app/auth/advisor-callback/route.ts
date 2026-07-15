/**
 * /auth/advisor-callback
 *
 * Handles the email-verification link for advisor sign-ups.
 * This is the ONLY place where app_metadata.role = "advisor" is set.
 *
 * Security guarantees:
 *   1. Code exchange happens server-side — the raw token never touches the browser.
 *   2. Admin client (service role) is used exclusively to set app_metadata.
 *      Users cannot forge this field via the client SDK.
 *   3. firm_name is read from user_metadata (set at signup) — it is not a trust
 *      boundary; only the role in app_metadata is the security claim.
 *   4. Operation is idempotent: if called twice (double-click email link), the
 *      second call detects an existing advisor record and skips provisioning.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // ── 3. Idempotency check ─────────────────────────────────────────────────
  // If the user already has advisor role, they just re-clicked the link.
  if (user.app_metadata?.role === "advisor") {
    return redirectTo(origin, "/advisor/dashboard");
  }

  // ── 4. Validate firm_name from user_metadata ──────────────────────────────
  // The user set this during signup. It's not a security claim — just used to
  // populate the advisor_firms row. Sanitised here before DB write.
  const rawFirmName = (user.user_metadata?.firm_name as string | undefined) ?? "";
  const firmName    = rawFirmName.trim().slice(0, 200);

  if (firmName.length < 2) {
    console.error("[advisor-callback] missing firm_name for user:", user.id);
    return redirectTo(origin, "/advisor/signup?error=missing_firm_name");
  }

  // ── 5. Provision (service-role only from here down) ───────────────────────
  const admin = createAdminClient();
  const ip = (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
  const ua = request.headers.get("user-agent") ?? null;

  // 5a. Set app_metadata.role — the authoritative security claim.
  //     Only the service-role key can write app_metadata; the client SDK cannot.
  const { error: roleErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { role: "advisor" },
  });

  if (roleErr) {
    console.error("[advisor-callback] app_metadata update failed:", roleErr.message);
    // Log the failure with a null firm_id (no firm record yet).
    await admin.from("advisor_audit_log").insert({
      firm_id:    null,
      event:      "PROVISION_FAILED",
      ip_address: ip,
      user_agent: ua,
      metadata:   { reason: "app_metadata_update_failed", error: roleErr.message, user_id: user.id },
    });
    return redirectTo(origin, "/advisor/signup?error=provision_failed");
  }

  // 5b. Create the advisor_firms row.
  const { data: firm, error: firmErr } = await admin
    .from("advisor_firms")
    .insert({ user_id: user.id, email: user.email!, firm_name: firmName })
    .select("id")
    .single();

  if (firmErr || !firm) {
    console.error("[advisor-callback] advisor_firms insert failed:", firmErr?.message);
    await admin.from("advisor_audit_log").insert({
      firm_id:    null,
      event:      "PROVISION_FAILED",
      ip_address: ip,
      user_agent: ua,
      metadata:   { reason: "firm_insert_failed", error: firmErr?.message, user_id: user.id },
    });
    return redirectTo(origin, "/advisor/signup?error=firm_creation_failed");
  }

  // 5c. Audit: successful sign-up.
  await admin.from("advisor_audit_log").insert({
    firm_id:    firm.id,
    event:      "ADVISOR_SIGNED_UP",
    ip_address: ip,
    user_agent: ua,
    metadata:   { email: user.email, firm_name: firmName },
  });

  return redirectTo(origin, "/advisor/dashboard");
}
