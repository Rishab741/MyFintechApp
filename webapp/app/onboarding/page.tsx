import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

// Server component — reads DB, redirects to the right step.
// Middleware already handles most routing via cookie; this is the fallback
// for users who hit /onboarding directly.
export default async function OnboardingIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: row } = await supabase
    .from("user_onboarding")
    .select("step")
    .eq("user_id", user.id)
    .single();

  const step: Step = (row?.step as Step) ?? "COMPLETED";
  redirect(STEP_ROUTES[step]);
}
