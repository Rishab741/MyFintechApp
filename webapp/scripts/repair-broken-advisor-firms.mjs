/**
 * One-off repair: scan every user with app_metadata.role === "advisor" and
 * create the missing advisor_firms row for any that don't have one.
 *
 * This is the exact bug class fixed in lib/advisor/ensure-firm.ts — role got
 * set before the firm row, and if the firm insert ever failed, nothing
 * retried it. This script finds every account currently stuck in that state
 * and heals it using the same logic (metadata-first, safe fallback name).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const ENV_PATH = "c:/Users/RISHAB CHOUHAN/MyFintechApp/webapp/.env.local";

let url, key;
for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (!m) continue;
  if (m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = m[2].trim();
  if (m[1] === "SUPABASE_SERVICE_ROLE_KEY") key = m[2].trim();
}
if (!url || !key) { console.error("Missing env values."); process.exit(1); }

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Gather every advisor-role user ─────────────────────────────────────────────
let advisors = [];
{
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error("listUsers failed:", error.message); process.exit(1); }
    advisors.push(...data.users.filter(u => u.app_metadata?.role === "advisor"));
    if (data.users.length < 200) break;
    page++;
  }
}
console.log(`Found ${advisors.length} advisor-role account(s).`);

let healed = 0, ok = 0, failed = 0;

for (const user of advisors) {
  const { data: existing } = await admin
    .from("advisor_firms").select("id").eq("user_id", user.id).maybeSingle();

  if (existing) {
    ok++;
    continue;
  }

  console.log(`  BROKEN: ${user.email} (${user.id.slice(0, 8)}…) — no firm row, healing…`);

  const meta = user.user_metadata ?? {};
  const rawFirmName = String(meta.firm_name ?? "").trim();
  const firmName = rawFirmName.length >= 2
    ? rawFirmName
    : `${(user.email ?? "advisor").split("@")[0]} Advisory`;

  const { data: firm, error } = await admin.from("advisor_firms").insert({
    user_id:                 user.id,
    email:                   user.email,
    firm_name:               firmName,
    firm_type:               String(meta.firm_type  ?? "").trim().slice(0, 100)  || null,
    aum_range:                String(meta.aum_range  ?? "").trim().slice(0, 50)   || null,
    team_size:                String(meta.team_size  ?? "").trim().slice(0, 50)   || null,
    contact_first_name:       String(meta.contact_first_name ?? "").trim().slice(0, 100) || null,
    contact_last_name:        String(meta.contact_last_name  ?? "").trim().slice(0, 100) || null,
    job_title:                String(meta.job_title  ?? "").trim().slice(0, 200)  || null,
    primary_use_case:         String(meta.primary_use_case   ?? "").trim().slice(0, 100) || null,
    onboarding_completed_at:  new Date().toISOString(),
  }).select("id").single();

  if (error) {
    console.error(`    FAILED: ${error.message}`);
    failed++;
    continue;
  }

  await admin.from("advisor_audit_log").insert({
    firm_id:  firm.id,
    event:    "FIRM_SELF_HEALED",
    metadata: { email: user.email, firm_name: firmName, reason: "manual_repair_script" },
  });

  console.log(`    healed -> firm "${firmName}" (${firm.id.slice(0, 8)}…)`);
  healed++;
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Already OK: ${ok}   Healed: ${healed}   Failed: ${failed}`);
