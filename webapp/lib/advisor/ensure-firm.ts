/**
 * ensureAdvisorFirm — idempotent, self-healing firm lookup/creation.
 *
 * The root cause of the "firm_not_found" bug: role=advisor and the
 * advisor_firms row were being set by two separate writes (auth callback:
 * set role, then insert firm). If the second write ever failed — a transient
 * error, a race — the account was left with a valid advisor role but no firm
 * row, and nothing ever retried the missing half. Every consumer that needs
 * a firm now goes through this single function instead of assuming the row
 * exists, so the gap can't reopen in a new code path.
 *
 * Service-role only — callers must already hold an admin client.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface EnsureFirmResult {
  firmId:  string;
  healed:  boolean;   // true if this call created the missing row
}

export async function ensureAdvisorFirm(
  admin: SupabaseClient,
  user: User,
): Promise<EnsureFirmResult | { error: string }> {
  const { data: existing, error: lookupErr } = await admin
    .from("advisor_firms")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupErr) {
    console.error("[ensure-firm] lookup failed:", lookupErr.message);
    return { error: "firm_lookup_failed" };
  }
  if (existing) {
    return { firmId: existing.id, healed: false };
  }

  // No firm row — create one. Prefer the signup-wizard metadata (firm_name,
  // firm_type, etc.); fall back to a safe placeholder so a repair never fails
  // outright just because the original metadata is thin.
  const meta = user.user_metadata ?? {};
  const rawFirmName = String(meta.firm_name ?? "").trim().slice(0, 200);
  const firmName = rawFirmName.length >= 2
    ? rawFirmName
    : `${(user.email ?? "advisor").split("@")[0]} Advisory`;

  const { data: firm, error: insErr } = await admin
    .from("advisor_firms")
    .insert({
      user_id:                 user.id,
      email:                   user.email!,
      firm_name:               firmName,
      firm_type:               String(meta.firm_type  ?? "").trim().slice(0, 100)  || null,
      aum_range:                String(meta.aum_range  ?? "").trim().slice(0, 50)   || null,
      team_size:                String(meta.team_size  ?? "").trim().slice(0, 50)   || null,
      contact_first_name:       String(meta.contact_first_name ?? "").trim().slice(0, 100) || null,
      contact_last_name:        String(meta.contact_last_name  ?? "").trim().slice(0, 100) || null,
      job_title:                String(meta.job_title  ?? "").trim().slice(0, 200)  || null,
      primary_use_case:         String(meta.primary_use_case   ?? "").trim().slice(0, 100) || null,
      onboarding_completed_at:  new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insErr || !firm) {
    console.error("[ensure-firm] insert failed:", insErr?.message);
    return { error: "firm_creation_failed" };
  }

  await admin.from("advisor_audit_log").insert({
    firm_id:  firm.id,
    event:    "FIRM_SELF_HEALED",
    metadata: { email: user.email, firm_name: firmName, reason: "missing_firm_row" },
  });

  return { firmId: firm.id, healed: true };
}
