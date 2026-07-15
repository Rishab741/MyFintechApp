/**
 * Promote a user to the admin observer role.
 *
 * SECURITY: This script requires SUPABASE_SERVICE_ROLE_KEY and must only be
 * run locally by the platform owner. There is deliberately NO HTTP endpoint
 * for this — an exposed promotion route would be a privilege-escalation hole.
 *
 * Use a DEDICATED account for admin (e.g. admin@yourdomain.com), not your
 * retail or advisor account: app_metadata.role is single-valued, so promoting
 * an advisor account would strip its advisor role.
 *
 * Usage:
 *   1. Sign up the admin email through the normal retail signup at "/" first.
 *   2. node scripts/promote-admin.mjs admin@yourdomain.com
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/promote-admin.mjs <email>");
  process.exit(1);
}

// ── Load env: prefer process.env, fall back to ../.env.local ─────────────────
const here = dirname(fileURLToPath(import.meta.url));
let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  try {
    const envFile = readFileSync(resolve(here, "..", ".env.local"), "utf8");
    for (const line of envFile.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (!m) continue;
      const [, k, v] = m;
      if (k === "NEXT_PUBLIC_SUPABASE_URL"  && !url) url = v.trim();
      if (k === "SUPABASE_SERVICE_ROLE_KEY" && !key) key = v.trim();
    }
  } catch {
    /* .env.local not found — rely on process.env */
  }
}

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Set them in webapp/.env.local or as environment variables."
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Find the user by email ────────────────────────────────────────────────────
let target = null;
let page = 1;
while (!target) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }
  target = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (data.users.length < 200) break;
  page += 1;
}

if (!target) {
  console.error(
    `No user found with email ${email}.\n` +
    "Sign the account up through the normal retail signup first, then re-run."
  );
  process.exit(1);
}

const existingRole = target.app_metadata?.role;
if (existingRole === "admin") {
  console.log(`${email} is already an admin. Nothing to do.`);
  process.exit(0);
}
if (existingRole === "advisor") {
  console.error(
    `${email} is an ADVISOR account. Promoting it would strip the advisor role.\n` +
    "Use a dedicated admin email instead."
  );
  process.exit(1);
}

// ── Promote ───────────────────────────────────────────────────────────────────
const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
  app_metadata: { ...target.app_metadata, role: "admin" },
});

if (updErr) {
  console.error("Promotion failed:", updErr.message);
  process.exit(1);
}

console.log(`✓ ${email} promoted to admin observer.`);
console.log("  - Sign in at /  → you will be routed to /admin");
console.log("  - All routes accessible; all writes blocked at the DB layer.");
