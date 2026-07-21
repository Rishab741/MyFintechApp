import { createClient } from "@supabase/supabase-js";
import { PUBLIC_ENV, getServiceRoleKey } from "@/lib/env";

/**
 * Service-role Supabase client.
 *
 * SECURITY: This client bypasses all RLS policies. It MUST only be instantiated
 * inside API route handlers and server actions — never imported by client components.
 * The SUPABASE_SERVICE_ROLE_KEY must never be sent to the browser.
 *
 * Both values are read through lib/env.ts, which strips a leading BOM and
 * whitespace — see that file for why this matters (a BOM in this key throws
 * a hard-to-diagnose "Cannot convert argument to a ByteString" error the
 * moment it's used to construct an HTTP header).
 *
 * Uses: provisioning advisor accounts, writing audit logs, updating app_metadata.
 */
export function createAdminClient() {
  const url = PUBLIC_ENV.SUPABASE_URL;
  const key = getServiceRoleKey();

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "These must be set in your server environment — never expose the service role key to the client."
    );
  }

  return createClient(url, key, {
    auth: {
      // Service-role clients must not store or refresh sessions.
      autoRefreshToken: false,
      persistSession:   false,
    },
  });
}
