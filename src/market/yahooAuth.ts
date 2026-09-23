/**
 * Yahoo Finance's v7 quote endpoint now requires a session (it started
 * returning 401 "Unauthorized" to plain requests — a change Yahoo rolled
 * out broadly, not something specific to this app). The fix is to visit
 * fc.yahoo.com once to seed a session cookie, then exchange it for a
 * "crumb" token that gets appended to quote requests.
 *
 * Unlike a server (see webapp/lib/yahoo-auth.ts), React Native's fetch
 * can't read the Set-Cookie response header directly — but its native
 * networking layer keeps its own cookie jar per domain automatically, so
 * doing the two requests in sequence is enough; only the crumb (read from
 * the response body, which is always readable) needs to be carried
 * forward manually.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const SESSION_TTL_MS = 50 * 60 * 1000; // Yahoo sessions last ~1hr; refresh a bit early

let cachedCrumb: { crumb: string; at: number } | null = null;

async function fetchCrumb(): Promise<string | null> {
  try {
    // Seeds the device's cookie jar for the yahoo.com domain.
    await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
    const res = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA },
    });
    const crumb = (await res.text()).trim();
    if (!crumb || crumb.includes('<')) return null; // error pages come back as HTML
    return crumb;
  } catch {
    return null;
  }
}

export async function getYahooCrumb(): Promise<string | null> {
  if (cachedCrumb && Date.now() - cachedCrumb.at < SESSION_TTL_MS) return cachedCrumb.crumb;
  const fresh = await fetchCrumb();
  if (fresh) { cachedCrumb = { crumb: fresh, at: Date.now() }; return fresh; }
  return cachedCrumb?.crumb ?? null;
}

export function invalidateYahooCrumb() {
  cachedCrumb = null;
}
