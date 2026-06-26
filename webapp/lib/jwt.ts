"use client";

import { createClient } from "@/lib/supabase/client";

// Module-level JWT cache — persists across SWR fetcher calls for the same
// browser session. Eliminates the redundant auth.getSession() call that was
// being made once per SWR hook on every page mount.
let _jwt     = "";
let _jwtExp  = 0; // unix seconds

export async function getJwt(): Promise<string> {
  // Return cached value if it expires more than 60 s from now
  if (_jwt && _jwtExp - 60 > Date.now() / 1000) return _jwt;

  const { data: { session } } = await createClient().auth.getSession();
  if (!session) { _jwt = ""; _jwtExp = 0; return ""; }

  _jwt = session.access_token;

  // Decode exp from the JWT payload (base64url segment 1)
  try {
    const [, payload] = session.access_token.split(".");
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    _jwtExp = exp as number;
  } catch {
    _jwtExp = Date.now() / 1000 + 3540; // fallback: 59 min
  }

  return _jwt;
}

// Call this on sign-out so stale tokens aren't served
export function clearJwtCache() {
  _jwt    = "";
  _jwtExp = 0;
}
