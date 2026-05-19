import { NextResponse } from "next/server";
import { fetchMarketSnapshot } from "@/lib/alpha-vantage";

export const runtime = "nodejs";
export const revalidate = 300; // 5 min Next.js cache

export async function GET() {
  try {
    const data = await fetchMarketSnapshot();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[market/route]", err);
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
