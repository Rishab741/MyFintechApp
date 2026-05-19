import { type NextRequest, NextResponse } from "next/server";

const YF = "https://query1.finance.yahoo.com";
const FIELDS = [
  "regularMarketPrice", "regularMarketChange", "regularMarketChangePercent",
  "regularMarketVolume", "marketCap", "shortName",
  "regularMarketDayHigh", "regularMarketDayLow", "regularMarketPreviousClose",
  "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "trailingPE", "forwardPE", "beta",
].join(",");

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  if (!raw.trim()) return NextResponse.json([]);

  const encoded = raw.split(",").map(s => encodeURIComponent(s.trim())).filter(Boolean).join(",");

  try {
    const res = await fetch(`${YF}/v7/finance/quote?symbols=${encoded}&fields=${FIELDS}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error(`YF ${res.status}`);
    const json = await res.json() as { quoteResponse?: { result?: Record<string, unknown>[] } };
    const results = json?.quoteResponse?.result ?? [];

    return NextResponse.json(
      results.map(r => ({
        symbol:        r.symbol,
        shortName:     r.shortName ?? r.symbol,
        price:         r.regularMarketPrice ?? 0,
        change:        r.regularMarketChange ?? 0,
        changePct:     r.regularMarketChangePercent ?? 0,
        volume:        r.regularMarketVolume ?? 0,
        marketCap:     r.marketCap,
        dayHigh:       r.regularMarketDayHigh ?? 0,
        dayLow:        r.regularMarketDayLow ?? 0,
        previousClose: r.regularMarketPreviousClose ?? 0,
        week52High:    r.fiftyTwoWeekHigh,
        week52Low:     r.fiftyTwoWeekLow,
        trailingPE:    r.trailingPE,
        forwardPE:     r.forwardPE,
        beta:          r.beta,
      })),
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch {
    return NextResponse.json([]);
  }
}
