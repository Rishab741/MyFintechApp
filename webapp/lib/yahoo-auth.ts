/**
 * Yahoo Finance's v7 quote endpoint now requires a session cookie + crumb
 * (it started returning 401 "Unauthorized" to plain requests — a change
 * Yahoo rolled out broadly, not something specific to this app). This is
 * the standard workaround: seed a session cookie from fc.yahoo.com, then
 * exchange it for a crumb, then send both on every quote request.
 *
 * The session is cached in-process and reused across requests/users (one
 * cookie+crumb pair is valid for many quote calls) rather than re-fetched
 * per request, and it's invalidated on a 401 so a stale/expired session
 * self-heals on the next request instead of wedging the whole endpoint.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const SESSION_TTL_MS = 50 * 60 * 1000; // Yahoo sessions last ~1hr; refresh a bit early

interface YahooSession {
  cookie: string;
  crumb: string;
  at: number;
}

let cached: YahooSession | null = null;

async function fetchSession(): Promise<YahooSession | null> {
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8_000),
    });
    const cookie = cookieRes.headers.get("set-cookie");
    if (!cookie) return null;

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
      signal: AbortSignal.timeout(8_000),
    });
    const crumb = (await crumbRes.text()).trim();
    // A failed crumb fetch comes back as an HTML error page, not a token.
    if (!crumb || crumb.includes("<")) return null;

    return { cookie, crumb, at: Date.now() };
  } catch {
    return null;
  }
}

export async function getYahooSession(): Promise<YahooSession | null> {
  if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached;
  const fresh = await fetchSession();
  if (fresh) { cached = fresh; return fresh; }
  // Fetch failed (network blip) — prefer a stale-but-working session over none.
  return cached;
}

export function invalidateYahooSession() {
  cached = null;
}
