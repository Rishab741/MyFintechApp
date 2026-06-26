import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── Valid state-machine transitions ───────────────────────────────────────────
type Step =
  | "PENDING_VERIFICATION"
  | "MFA_SETUP"
  | "WORKSPACE_CONFIGURED"
  | "INTEGRATION_CONNECTED"
  | "COMPLETED";

const TRANSITIONS: Record<Step, Step | null> = {
  PENDING_VERIFICATION:  "MFA_SETUP",
  MFA_SETUP:             "WORKSPACE_CONFIGURED",
  WORKSPACE_CONFIGURED:  "INTEGRATION_CONNECTED",
  INTEGRATION_CONNECTED: "COMPLETED",
  COMPLETED:             null,
};

// ── Cookie that middleware reads for zero-latency routing ─────────────────────
const OB_COOKIE = "platstock_ob";
const COOKIE_OPTS = {
  path:     "/",
  maxAge:   60 * 60 * 24 * 30, // 30 days
  httpOnly: false,              // readable by middleware (Edge runtime)
  sameSite: "lax" as const,
};

function stepCookie(res: NextResponse, step: Step) {
  res.cookies.set(OB_COOKIE, step, COOKIE_OPTS);
}

// ── POST /api/onboarding ──────────────────────────────────────────────────────
// Body: { action: "advance" | "workspace" | "connect", ...data }
//
// advance          — move to the next step in the state machine
// workspace        — save workspace_name + currency, then advance
// connect          — save integration_type, then advance to COMPLETED
//
// Each call:
//  1. Validates the transition is legal
//  2. Writes the new step to user_onboarding
//  3. Sets the routing cookie on the response (middleware reads this)
//  4. Fire-and-forget audit log insert (never delays the response)
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body as { action: string };

  // ── Fetch current state ───────────────────────────────────────────────────
  const { data: row, error: fetchErr } = await supabase
    .from("user_onboarding")
    .select("step, workspace_name, workspace_currency, mfa_enrolled")
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Onboarding record not found" }, { status: 404 });
  }

  const currentStep = row.step as Step;

  // ── Build the update payload ──────────────────────────────────────────────
  let update: Record<string, unknown> = {};
  let nextStep: Step;

  if (action === "workspace") {
    // Validate we're in the right state
    if (currentStep !== "WORKSPACE_CONFIGURED") {
      return NextResponse.json(
        { error: `Cannot set workspace from step ${currentStep}` },
        { status: 409 },
      );
    }
    const { name, currency } = body as { name: string; currency: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "workspace_name is required" }, { status: 400 });
    }
    update = {
      workspace_name:     name.trim(),
      workspace_currency: currency ?? "USD",
    };
    nextStep = TRANSITIONS[currentStep]!;

  } else if (action === "connect") {
    if (currentStep !== "INTEGRATION_CONNECTED") {
      return NextResponse.json(
        { error: `Cannot set integration from step ${currentStep}` },
        { status: 409 },
      );
    }
    update = { integration_type: body.type ?? null };
    nextStep = TRANSITIONS[currentStep]!;

  } else if (action === "advance") {
    // Generic advance — used by MFA step (with optional mfa_enrolled flag)
    const next = TRANSITIONS[currentStep];
    if (!next) {
      return NextResponse.json({ error: "Already completed" }, { status: 409 });
    }
    if (body.mfa_enrolled) update.mfa_enrolled = true;
    nextStep = next;

  } else {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // ── Write new state ───────────────────────────────────────────────────────
  const isCompleted = nextStep === "COMPLETED";
  const { error: updateErr } = await supabase
    .from("user_onboarding")
    .update({
      ...update,
      step:         nextStep,
      completed_at: isCompleted ? new Date().toISOString() : null,
    })
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // ── Fire-and-forget audit log ─────────────────────────────────────────────
  // We deliberately do NOT await this — it must never delay the response.
  void supabase.from("onboarding_audit_log").insert({
    user_id:   user.id,
    event:     `ONBOARDING_${action.toUpperCase()}`,
    step_from: currentStep,
    step_to:   nextStep,
    metadata:  { action, ...update },
    ip:        req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
    user_agent: req.headers.get("user-agent"),
  });

  // ── Set routing cookie + respond ──────────────────────────────────────────
  const res = NextResponse.json({ step: nextStep, ok: true });
  stepCookie(res, nextStep);
  return res;
}

// ── GET /api/onboarding ───────────────────────────────────────────────────────
// Returns the current onboarding state. Used by /onboarding page to redirect.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { data: row } = await supabase
    .from("user_onboarding")
    .select("step, workspace_name, workspace_currency, mfa_enrolled, integration_type, started_at")
    .eq("user_id", user.id)
    .single();

  const step: Step = (row?.step as Step) ?? "COMPLETED";
  const res = NextResponse.json({ step, row });

  // Sync the cookie in case it got cleared
  stepCookie(res, step);
  return res;
}
