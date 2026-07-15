import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * SECURITY: This client bypasses all RLS policies. It MUST only be instantiated
 * inside API route handlers and server actions — never imported by client components.
 * The SUPABASE_SERVICE_ROLE_KEY must never be sent to the browser.
 *
 * Uses: provisioning advisor accounts, writing audit logs, updating app_metadata.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
