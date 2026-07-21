/**
 * Centralised, sanitised environment variable access.
 *
 * Root cause of the "firm_lookup_failed" / ByteString crash: Windows
 * PowerShell's pipe-to-stdin mechanism (used to set SUPABASE_SERVICE_ROLE_KEY
 * and NEXT_PUBLIC_ENGINE_URL on Vercel) silently prepends a UTF-8 BOM
 * (U+FEFF) to the value. Verified directly against the live Lambda's
 * process.env — the stored value's first character is code point 65279.
 * Multiple attempts to fix this at the shell/CLI layer (forcing
 * $OutputEncoding, cmd.exe stdin redirection) did NOT eliminate it — this
 * class of corruption can be reintroduced by any future tool that sets these
 * vars (a dashboard paste, a different CLI, CI/CD), so fixing it once in the
 * shell is not durable.
 *
 * The permanent fix lives here instead: every consumer reads through this
 * module rather than touching process.env directly, so a BOM anywhere in the
 * value (and any surrounding whitespace) is stripped exactly once, regardless
 * of source. The BOM character is built from its code point (0xFEFF) rather
 * than written as a literal character in this file, so this fix can't itself
 * fall victim to the same class of encoding bug it's guarding against.
 */

const BOM_CHAR = String.fromCharCode(0xfeff);

function clean(value: string | undefined): string {
  return (value ?? "").split(BOM_CHAR).join("").trim();
}

// NEXT_PUBLIC_* vars are inlined at build time by Next.js's static analysis,
// which requires `process.env.NEXT_PUBLIC_X` to appear textually in source.
// That substitution happens right here, once — every file that imports these
// constants gets the already-cleaned value, on both server and client bundles.
export const PUBLIC_ENV = {
  SUPABASE_URL:      clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  ENGINE_URL:        clean(process.env.NEXT_PUBLIC_ENGINE_URL) || "http://localhost:8000",
};

// Server-only secret — never import this from a client component.
// Read lazily (not at module scope) so it always reflects the current
// process.env in serverless environments.
export function getServiceRoleKey(): string {
  return clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
