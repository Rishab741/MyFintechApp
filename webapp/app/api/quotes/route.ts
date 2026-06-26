import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const YF = "https://query1.finance.yahoo.com";
const FIELDS = [
  "regularMarketPrice", "regularMarketChange", "regularMarketChangePercent",
  "regularMarketVolume", "marketCap", "shortName",
  "regularMarketDayHigh", "regularMarketDayLow", "regularMarketPreviousClose",
  "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "trailingPE", "forwardPE", "beta",
].join(",");

// In-process cache — works in both dev and production.
// next: { revalidate } only works in prod (Data Cache is disabled in dev).
const _cache = new Map<string, { data: unknown[]; at: number }>();
const TTL_MS = 30_000; // 30 seconds

const HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  if (!raw.trim()) return NextResponse.json([]);

  // ── Cache hit ───────────────────────────────────────────────────────────
  const hit = _cache.get(raw);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data, { headers: HEADERS });
  }

  const encoded = raw
    .split(",")
    .map((s) => encodeURIComponent(s.trim()))
    .filter(Boolean)
    .join(",");

  try {
    const res = await fetch(
      `${YF}/v7/finance/quote?symbols=${encoded}&fields=${FIELDS}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal:  AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) throw new Error(`YF ${res.status}`);

    const json = (await res.json()) as {
      quoteResponse?: { result?: Record<string, unknown>[] };
    };
    const raw_results = json?.quoteResponse?.result ?? [];

    const data = raw_results.map((r) => ({
      symbol:        r.symbol,
      shortName:     r.shortName ?? r.symbol,
      price:         r.regularMarketPrice          ?? 0,
      change:        r.regularMarketChange         ?? 0,
      changePct:     r.regularMarketChangePercent  ?? 0,
      volume:        r.regularMarketVolume         ?? 0,
      marketCap:     r.marketCap,
      dayHigh:       r.regularMarketDayHigh        ?? 0,
      dayLow:        r.regularMarketDayLow         ?? 0,
      previousClose: r.regularMarketPreviousClose  ?? 0,
      week52High:    r.fiftyTwoWeekHigh,
      week52Low:     r.fiftyTwoWeekLow,
      trailingPE:    r.trailingPE,
      forwardPE:     r.forwardPE,
      beta:          r.beta,
    }));

    _cache.set(raw, { data, at: Date.now() });
    return NextResponse.json(data, { headers: HEADERS });
  } catch {
    // Return cached stale data on error rather than an empty array
    if (hit) return NextResponse.json(hit.data, { headers: HEADERS });
    return NextResponse.json([]);
  }
}
