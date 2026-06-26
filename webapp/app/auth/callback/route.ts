import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

type Step =
  | "PENDING_VERIFICATION"
  | "MFA_SETUP"
  | "WORKSPACE_CONFIGURED"
  | "INTEGRATION_CONNECTED"
  | "COMPLETED";

const STEP_ROUTES: Record<Step, string> = {
  PENDING_VERIFICATION:  "/onboarding/verify-email",
  MFA_SETUP:             "/onboarding/mfa",
  WORKSPACE_CONFIGURED:  "/onboarding/workspace",
  INTEGRATION_CONNECTED: "/onboarding/connect",
  COMPLETED:             "/dashboard",
};

const OB_COOKIE = "platstock_ob";
const COOKIE_OPTS = {
  path:    "/",
  maxAge:  60 * 60 * 24 * 30,
  sameSite: "lax" as const,
};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = await createClient();
  const { error: codeErr } = await supabase.auth.exchangeCodeForSession(code);

  if (codeErr) {
    return NextResponse.redirect(`${origin}/?error=auth_callback_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/`);
  }

  // ── Look up onboarding row ────────────────────────────────────────────────
  const { data: row } = await supabase
    .from("user_onboarding")
    .select("step")
    .eq("user_id", user.id)
    .single();

  let currentStep: Step;

  if (!row) {
    // Existing user (pre-onboarding, or row was cleared) → skip onboarding.
    currentStep = "COMPLETED";
  } else if (row.step === "PENDING_VERIFICATION") {
    // Email just verified — advance to MFA_SETUP, write audit log.
    await supabase
      .from("user_onboarding")
      .update({ step: "MFA_SETUP" })
      .eq("user_id", user.id);

    void supabase.from("onboarding_audit_log").insert({
      user_id:  user.id,
      event:    "ONBOARDING_EMAIL_VERIFIED",
      step_from: "PENDING_VERIFICATION",
      step_to:   "MFA_SETUP",
      metadata: {},
    });

    currentStep = "MFA_SETUP";
  } else {
    currentStep = row.step as Step;
  }

  const redirectUrl = STEP_ROUTES[currentStep] ?? "/dashboard";
  const res = NextResponse.redirect(`${origin}${redirectUrl}`);

  // Set the routing cookie so middleware never needs a DB call.
  res.cookies.set(OB_COOKIE, currentStep, COOKIE_OPTS);

  return res;
}
