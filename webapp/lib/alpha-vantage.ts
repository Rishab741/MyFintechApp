/**
 * Alpha Vantage API client — server-side only.
 * All calls are cached in-process for CACHE_TTL_MS to stay within free-tier limits.
 * Set ALPHA_VANTAGE_API_KEY in .env.local; falls back to "demo" key for testing.
 */

const AV_BASE = "https://www.alphavantage.co/query";
const API_KEY  = process.env.ALPHA_VANTAGE_API_KEY ?? "demo";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── In-process cache ──────────────────────────────────────────────────────────
const _cache = new Map<string, { data: unknown; at: number }>();

async function avFetch<T>(params: Record<string, string>): Promise<T> {
  const qs  = new URLSearchParams({ ...params, apikey: API_KEY });
  const key = qs.toString();

  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T;

  const res = await fetch(`${AV_BASE}?${qs}`, {
    signal: AbortSignal.timeout(10_000),
    next:   { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Alpha Vantage ${res.status} for ${params.function}`);
  const data = await res.json() as T;
  _cache.set(key, { data, at: Date.now() });
  return data;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Quote {
  symbol:        string;
  price:         number;
  change:        number;
  changePct:     number;
  volume:        number;
  previousClose: number;
  high:          number;
  low:           number;
}

export interface Mover {
  ticker:    string;
  price:     number;
  change:    number;
  changePct: number;
  volume:    number;
}

export interface SectorMap { [sector: string]: number }

export interface SessionInfo {
  region:    string;
  exchanges: string;
  status:    "open" | "closed";
  open:      string;
  close:     string;
}

export interface NewsItem {
  title:     string;
  url:       string;
  source:    string;
  published: string;
  summary:   string;
  score:     number;
  label:     string;
}

export interface MarketSnapshot {
  fetchedAt: string;
  sessions:  SessionInfo[];
  quotes:    Record<string, Quote>;
  sectors:   SectorMap;
  gainers:   Mover[];
  losers:    Mover[];
  news:      NewsItem[];
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseQuote(raw: Record<string, Record<string, string>>, symbol: string): Quote | null {
  const q = raw["Global Quote"];
  if (!q || !q["05. price"]) return null;
  return {
    symbol,
    price:         parseFloat(q["05. price"]),
    change:        parseFloat(q["09. change"]),
    changePct:     parseFloat((q["10. change percent"] ?? "0%").replace("%", "")),
    volume:        parseInt(q["06. volume"] ?? "0", 10),
    previousClose: parseFloat(q["08. previous close"] ?? "0"),
    high:          parseFloat(q["03. high"] ?? "0"),
    low:           parseFloat(q["04. low"] ?? "0"),
  };
}

function parseMover(m: Record<string, string>): Mover {
  return {
    ticker:    m.ticker,
    price:     parseFloat(m.price ?? "0"),
    change:    parseFloat(m.change_amount ?? "0"),
    changePct: parseFloat((m.change_percentage ?? "0%").replace("%", "")),
    volume:    parseInt(m.volume ?? "0", 10),
  };
}

function parseSector(raw: Record<string, Record<string, string>>): SectorMap {
  const key = Object.keys(raw).find(k => k.includes("Real-Time")) ?? "";
  if (!key) return {};
  return Object.fromEntries(
    Object.entries(raw[key] ?? {}).map(([s, v]) => [
      s, parseFloat((v as string).replace("%", "")),
    ])
  );
}

function parseSession(m: Record<string, string>): SessionInfo {
  return {
    region:    m.region,
    exchanges: m.primary_exchanges ?? "",
    status:    (m.current_status ?? "closed") === "open" ? "open" : "closed",
    open:      m.local_open ?? "",
    close:     m.local_close ?? "",
  };
}

function parseNews(raw: Record<string, unknown>): NewsItem[] {
  const feed = (raw.feed ?? []) as Record<string, string>[];
  return feed.slice(0, 15).map(n => ({
    title:     n.title ?? "",
    url:       n.url ?? "",
    source:    n.source ?? "",
    published: n.time_published ?? "",
    summary:   n.summary ?? "",
    score:     parseFloat(n.overall_sentiment_score ?? "0"),
    label:     n.overall_sentiment_label ?? "Neutral",
  }));
}

// ── Demo / fallback data ──────────────────────────────────────────────────────
// Shown when API key is absent or rate-limited so the page is always visual.

function demoSnapshot(): MarketSnapshot {
  const now = new Date();
  const isUsOpen = now.getUTCHours() >= 13 && now.getUTCHours() < 20;
  const isEuOpen = now.getUTCHours() >= 7  && now.getUTCHours() < 15;

  return {
    fetchedAt: now.toISOString(),
    sessions: [
      { region: "United States", exchanges: "NYSE, NASDAQ", status: isUsOpen  ? "open" : "closed", open: "09:30", close: "16:00" },
      { region: "Europe",        exchanges: "LSE, XETRA",   status: isEuOpen  ? "open" : "closed", open: "08:00", close: "16:30" },
      { region: "Asia/Pacific",  exchanges: "TSE, HKEX",    status: "closed",                      open: "09:00", close: "15:30" },
      { region: "Forex/Crypto",  exchanges: "24/7",          status: "open",                        open: "00:00", close: "24:00" },
    ],
    quotes: {
      SPY:   { symbol: "SPY",   price: 523.47, change: 3.21,  changePct:  0.62, volume: 45_231_000, previousClose: 520.26, high: 524.10, low: 519.80 },
      QQQ:   { symbol: "QQQ",   price: 448.82, change: 1.95,  changePct:  0.44, volume: 31_800_000, previousClose: 446.87, high: 449.50, low: 445.60 },
      GLD:   { symbol: "GLD",   price: 218.34, change: -0.87, changePct: -0.40, volume:  8_120_000, previousClose: 219.21, high: 219.50, low: 217.90 },
      BTC:   { symbol: "BTC",   price: 67_843,  change: 1_240, changePct:  1.86, volume:  0, previousClose: 66_603, high: 68_200, low: 66_800 },
      EURUSD:{ symbol: "EUR/USD", price: 1.0824, change: 0.0012, changePct: 0.11, volume: 0, previousClose: 1.0812, high: 1.0841, low: 1.0808 },
    },
    sectors: {
      "Technology":         2.1,
      "Consumer Discret.":  1.4,
      "Communication":      0.9,
      "Health Care":        0.3,
      "Financials":         0.6,
      "Industrials":       -0.2,
      "Real Estate":       -0.8,
      "Energy":            -1.1,
      "Materials":         -0.4,
      "Utilities":          0.2,
      "Consumer Staples":  -0.1,
    },
    gainers: [
      { ticker: "NVDA", price: 1024.5, change: 48.2,  changePct: 4.94, volume: 62_000_000 },
      { ticker: "META", price: 512.3,  change: 18.7,  changePct: 3.79, volume: 18_000_000 },
      { ticker: "AMD",  price: 168.7,  change: 5.9,   changePct: 3.62, volume: 42_000_000 },
      { ticker: "TSLA", price: 180.2,  change: 5.8,   changePct: 3.32, volume: 98_000_000 },
      { ticker: "MSFT", price: 432.8,  change: 6.2,   changePct: 1.45, volume: 22_000_000 },
    ],
    losers: [
      { ticker: "INTC", price: 28.4,  change: -1.8,  changePct: -5.96, volume: 55_000_000 },
      { ticker: "BIDU", price: 89.2,  change: -4.1,  changePct: -4.39, volume: 12_000_000 },
      { ticker: "MU",   price: 110.3, change: -4.0,  changePct: -3.50, volume: 28_000_000 },
      { ticker: "BA",   price: 162.4, change: -5.1,  changePct: -3.04, volume: 14_000_000 },
      { ticker: "XOM",  price: 114.8, change: -2.1,  changePct: -1.80, volume: 19_000_000 },
    ],
    news: [
      { title: "Fed signals possible rate pause as inflation cools", url: "#", source: "Reuters", published: now.toISOString(), summary: "Federal Reserve officials indicated a potential pause in rate hikes...", score: 0.28, label: "Bullish" },
      { title: "NVIDIA posts record quarterly revenue driven by AI chip demand", url: "#", source: "Bloomberg", published: now.toISOString(), summary: "NVIDIA Corporation reported record quarterly results...", score: 0.52, label: "Bullish" },
      { title: "Oil prices slide on weak China manufacturing data", url: "#", source: "WSJ", published: now.toISOString(), summary: "Crude oil prices declined as manufacturing data from China...", score: -0.21, label: "Bearish" },
      { title: "Treasury yields retreat from 16-year highs", url: "#", source: "FT", published: now.toISOString(), summary: "U.S. Treasury yields pulled back as investors reassessed...", score: 0.11, label: "Neutral" },
      { title: "Tech sector leads broad market rally", url: "#", source: "CNBC", published: now.toISOString(), summary: "Technology stocks led a broad market rally as investors...", score: 0.38, label: "Bullish" },
    ],
  };
}

// ── Main aggregator ───────────────────────────────────────────────────────────

export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  if (API_KEY === "demo") return demoSnapshot();

  const symbols = ["SPY", "QQQ", "GLD"];

  const [statusRes, moversRes, sectorRes, newsRes, ...quoteResults] = await Promise.allSettled([
    avFetch<Record<string, unknown>>({ function: "MARKET_STATUS" }),
    avFetch<Record<string, unknown>>({ function: "TOP_GAINERS_LOSERS" }),
    avFetch<Record<string, unknown>>({ function: "SECTOR" }),
    avFetch<Record<string, unknown>>({ function: "NEWS_SENTIMENT", sort: "LATEST", limit: "15" }),
    ...symbols.map(s => avFetch<Record<string, Record<string, string>>>({ function: "GLOBAL_QUOTE", symbol: s })),
    avFetch<Record<string, Record<string, string>>>({ function: "CURRENCY_EXCHANGE_RATE", from_currency: "EUR", to_currency: "USD" }),
  ]);

  const demo = demoSnapshot();

  // Sessions
  let sessions: SessionInfo[] = demo.sessions;
  if (statusRes.status === "fulfilled") {
    const markets = (statusRes.value.markets ?? []) as Record<string, string>[];
    if (markets.length) sessions = markets.slice(0, 6).map(parseSession);
  }

  // Sectors
  let sectors: SectorMap = demo.sectors;
  if (sectorRes.status === "fulfilled") {
    const parsed = parseSector(sectorRes.value as Record<string, Record<string, string>>);
    if (Object.keys(parsed).length) sectors = parsed;
  }

  // Movers
  let gainers = demo.gainers;
  let losers  = demo.losers;
  if (moversRes.status === "fulfilled") {
    const raw = moversRes.value as Record<string, Record<string, string>[]>;
    if (raw.top_gainers?.length) gainers = raw.top_gainers.slice(0, 5).map(parseMover);
    if (raw.top_losers?.length)  losers  = raw.top_losers.slice(0, 5).map(parseMover);
  }

  // Quotes
  const quotes: Record<string, Quote> = { ...demo.quotes };
  quoteResults.forEach((res, i) => {
    if (res.status === "fulfilled") {
      const q = parseQuote(res.value as Record<string, Record<string, string>>, symbols[i] ?? "EUR/USD");
      if (q) quotes[q.symbol] = q;
    }
  });

  // News
  let news = demo.news;
  if (newsRes.status === "fulfilled") {
    const parsed = parseNews(newsRes.value as Record<string, unknown>);
    if (parsed.length) news = parsed;
  }

  return { fetchedAt: new Date().toISOString(), sessions, quotes, sectors, gainers, losers, news };
}
