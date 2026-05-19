"use client";

import useSWR from "swr";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, AreaChart, Area, Tooltip as RTooltip,
  BarChart, Bar, Cell, XAxis, YAxis,
} from "recharts";
import type { MarketSnapshot, Quote, Mover, SessionInfo, NewsItem } from "@/lib/alpha-vantage";
import { useFinnhubWs, type WsStatus } from "@/hooks/use-finnhub-ws";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab          = "overview" | "stocks" | "movers" | "sectors" | "news";
type SortKey      = "price" | "changePct" | "volume" | "marketCap";
type SortDir      = "asc" | "desc";
type SectorFilter = "All" | "Technology" | "Financials" | "Healthcare" | "Energy" | "Consumer" | "Industrials" | "Crypto";
type MoversView   = "gainers" | "losers";
type NewsSentiment = "All" | "Bullish" | "Bearish" | "Neutral";

interface YfQuote {
  symbol:        string;
  shortName:     string;
  price:         number;
  change:        number;
  changePct:     number;
  volume:        number;
  marketCap?:    number;
  dayHigh?:      number;
  dayLow?:       number;
  previousClose?: number;
  week52High?:   number;
  week52Low?:    number;
  trailingPE?:   number;
  forwardPE?:    number;
  beta?:         number;
}

interface StockItem { symbol: string; name: string; sector: SectorFilter; }

// ─── Stock universe ───────────────────────────────────────────────────────────
const UNIVERSE: StockItem[] = [
  { symbol: "AAPL",    name: "Apple",              sector: "Technology"  },
  { symbol: "MSFT",    name: "Microsoft",           sector: "Technology"  },
  { symbol: "NVDA",    name: "NVIDIA",              sector: "Technology"  },
  { symbol: "GOOGL",   name: "Alphabet",            sector: "Technology"  },
  { symbol: "META",    name: "Meta Platforms",      sector: "Technology"  },
  { symbol: "TSLA",    name: "Tesla",               sector: "Technology"  },
  { symbol: "AMD",     name: "AMD",                 sector: "Technology"  },
  { symbol: "INTC",    name: "Intel",               sector: "Technology"  },
  { symbol: "CRM",     name: "Salesforce",          sector: "Technology"  },
  { symbol: "ORCL",    name: "Oracle",              sector: "Technology"  },
  { symbol: "JPM",     name: "JPMorgan Chase",      sector: "Financials"  },
  { symbol: "BAC",     name: "Bank of America",     sector: "Financials"  },
  { symbol: "GS",      name: "Goldman Sachs",       sector: "Financials"  },
  { symbol: "MS",      name: "Morgan Stanley",      sector: "Financials"  },
  { symbol: "V",       name: "Visa",                sector: "Financials"  },
  { symbol: "MA",      name: "Mastercard",          sector: "Financials"  },
  { symbol: "WFC",     name: "Wells Fargo",         sector: "Financials"  },
  { symbol: "BLK",     name: "BlackRock",           sector: "Financials"  },
  { symbol: "JNJ",     name: "Johnson & Johnson",   sector: "Healthcare"  },
  { symbol: "LLY",     name: "Eli Lilly",           sector: "Healthcare"  },
  { symbol: "UNH",     name: "UnitedHealth",        sector: "Healthcare"  },
  { symbol: "ABBV",    name: "AbbVie",              sector: "Healthcare"  },
  { symbol: "PFE",     name: "Pfizer",              sector: "Healthcare"  },
  { symbol: "MRK",     name: "Merck",               sector: "Healthcare"  },
  { symbol: "XOM",     name: "ExxonMobil",          sector: "Energy"      },
  { symbol: "CVX",     name: "Chevron",             sector: "Energy"      },
  { symbol: "COP",     name: "ConocoPhillips",      sector: "Energy"      },
  { symbol: "OXY",     name: "Occidental",          sector: "Energy"      },
  { symbol: "WMT",     name: "Walmart",             sector: "Consumer"    },
  { symbol: "COST",    name: "Costco",              sector: "Consumer"    },
  { symbol: "AMZN",    name: "Amazon",              sector: "Consumer"    },
  { symbol: "HD",      name: "Home Depot",          sector: "Consumer"    },
  { symbol: "NKE",     name: "Nike",                sector: "Consumer"    },
  { symbol: "MCD",     name: "McDonald's",          sector: "Consumer"    },
  { symbol: "CAT",     name: "Caterpillar",         sector: "Industrials" },
  { symbol: "BA",      name: "Boeing",              sector: "Industrials" },
  { symbol: "GE",      name: "GE Aerospace",        sector: "Industrials" },
  { symbol: "HON",     name: "Honeywell",           sector: "Industrials" },
  { symbol: "LMT",     name: "Lockheed Martin",     sector: "Industrials" },
  { symbol: "BTC-USD", name: "Bitcoin",             sector: "Crypto"      },
  { symbol: "ETH-USD", name: "Ethereum",            sector: "Crypto"      },
  { symbol: "SOL-USD", name: "Solana",              sector: "Crypto"      },
  { symbol: "BNB-USD", name: "BNB",                 sector: "Crypto"      },
  { symbol: "COIN",    name: "Coinbase",             sector: "Crypto"      },
];

const SECTOR_FILTERS: SectorFilter[] = ["All","Technology","Financials","Healthcare","Energy","Consumer","Industrials","Crypto"];

const FH_SYMBOLS: Record<string, string> = {
  SPY: "SPY", QQQ: "QQQ", GLD: "GLD", BTC: "BINANCE:BTCUSDT",
};

const REGIONS = [
  { id:"US",  label:"S&P 500",   region:"Americas",     change: 0.62 },
  { id:"NDQ", label:"NASDAQ",    region:"Americas",     change: 0.44 },
  { id:"TSX", label:"TSX",       region:"Americas",     change: 0.18 },
  { id:"MEX", label:"IPC",       region:"Americas",     change:-0.31 },
  { id:"UK",  label:"FTSE 100",  region:"Europe",       change:-0.12 },
  { id:"GER", label:"DAX",       region:"Europe",       change: 0.35 },
  { id:"FRA", label:"CAC 40",    region:"Europe",       change: 0.21 },
  { id:"ITA", label:"FTSE MIB",  region:"Europe",       change: 0.09 },
  { id:"JP",  label:"Nikkei",    region:"Asia/Pacific", change:-0.54 },
  { id:"CN",  label:"Shanghai",  region:"Asia/Pacific", change:-1.12 },
  { id:"HK",  label:"Hang Seng", region:"Asia/Pacific", change:-0.88 },
  { id:"AU",  label:"ASX 200",   region:"Asia/Pacific", change: 0.14 },
  { id:"IN",  label:"Nifty 50",  region:"Asia/Pacific", change: 0.73 },
  { id:"KR",  label:"KOSPI",     region:"Asia/Pacific", change:-0.22 },
  { id:"BR",  label:"Bovespa",   region:"EM",           change: 0.55 },
  { id:"ZA",  label:"JSE",       region:"EM",           change:-0.19 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url).then(r => r.json());
const isPos   = (v: number) => v >= 0;
const fmtPct  = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const fmtUsd  = (v: number) => v >= 10000
  ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  : `$${v.toFixed(2)}`;
const fmtVol  = (v: number) => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(1)}K` : String(v);
const fmtCap  = (v?: number) => !v ? "—" : v >= 1e12 ? `$${(v/1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(1)}M`;
const clrPos  = (v: number) => v >= 0 ? "#10b981" : "#ef4444";
const clrCls  = (v: number) => v >= 0 ? "text-emerald-400" : "text-red-400";
const bgCls   = (v: number) => v >= 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300";

function sparkPoints(price: number, change: number, n = 24): { v: number }[] {
  const prev = price - change;
  return Array.from({ length: n }, (_, i) => ({
    v: prev + change * (i / (n - 1)) + (Math.random() - 0.5) * Math.abs(change) * 0.45,
  }));
}

function fearGreedScore(sectors: Record<string, number>): number {
  const vals = Object.values(sectors);
  if (!vals.length) return 50;
  return Math.max(0, Math.min(100, Math.round(50 + (vals.reduce((a, b) => a + b, 0) / vals.length) * 12)));
}

function fgMeta(score: number): { label: string; color: string; ringColor: string } {
  if (score >= 75) return { label: "EXTREME GREED", color: "#10b981", ringColor: "rgba(16,185,129,0.3)" };
  if (score >= 55) return { label: "GREED",          color: "#34d399", ringColor: "rgba(52,211,153,0.3)" };
  if (score >= 45) return { label: "NEUTRAL",         color: "#fbbf24", ringColor: "rgba(251,191,36,0.3)" };
  if (score >= 25) return { label: "FEAR",            color: "#f97316", ringColor: "rgba(249,115,22,0.3)" };
  return               { label: "EXTREME FEAR",   color: "#ef4444", ringColor: "rgba(239,68,68,0.3)" };
}

function newsTime(raw: string): string {
  try {
    const d = new Date(raw.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6"));
    // Explicit locale + timeZone avoids server/client mismatch when Node and
    // the browser have different default locales.
    return d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// ─── LiveClock ────────────────────────────────────────────────────────────────
// Initialized to "" so server HTML is an empty string — suppressHydrationWarning
// lets React skip the mismatch check for this inherently time-varying element.
function LiveClock() {
  const [et, setEt] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      });
    setEt(fmt());
    const id = setInterval(() => setEt(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span suppressHydrationWarning className="text-xs font-mono text-slate-500">
      {et ? `${et} ET` : ""}
    </span>
  );
}

// ─── TickerTape ───────────────────────────────────────────────────────────────
function TickerTape({ quotes, mergedQuotes }: { quotes: Record<string, Quote>; mergedQuotes: Record<string, Quote> }) {
  const items = [
    { label: "S&P 500", q: mergedQuotes["SPY"] ?? quotes["SPY"] },
    { label: "NASDAQ",  q: mergedQuotes["QQQ"] ?? quotes["QQQ"] },
    { label: "Gold",    q: mergedQuotes["GLD"] ?? quotes["GLD"] },
    { label: "Bitcoin", q: mergedQuotes["BTC"] ?? quotes["BTC"] },
    { label: "EUR/USD", q: mergedQuotes["EURUSD"] ?? quotes["EURUSD"] },
  ].filter(i => !!i.q);

  if (!items.length) return null;

  const strip = [...items, ...items]; // double for seamless loop

  return (
    <div className="overflow-hidden border-b border-slate-800/60 bg-slate-900/40" style={{ height: 32 }}>
      <div className="flex items-center h-full animate-ticker whitespace-nowrap" style={{ width: "max-content" }}>
        {strip.map(({ label, q }, idx) => {
          if (!q) return null;
          const up = isPos(q.changePct);
          return (
            <span key={idx} className="inline-flex items-center gap-2 px-6 border-r border-slate-800/50 h-full text-xs font-mono">
              <span className="text-slate-500">{label}</span>
              <span className="text-white font-bold">{fmtUsd(q.price)}</span>
              <span className={up ? "text-emerald-400" : "text-red-400"}>{fmtPct(q.changePct)}</span>
              <span className={up ? "text-emerald-600" : "text-red-600"}>{up ? "▲" : "▼"}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── WsStatusBadge ────────────────────────────────────────────────────────────
function WsStatusBadge({ status }: { status: WsStatus }) {
  const map: Record<WsStatus, { label: string; cls: string; dot?: string }> = {
    idle:         { label: "WS IDLE",        cls: "text-slate-500 border-slate-700"                },
    connecting:   { label: "CONNECTING",     cls: "text-amber-400 border-amber-500/30"             },
    connected:    { label: "STREAMING",      cls: "text-cyan-300 border-cyan-500/30", dot: "bg-cyan-400" },
    reconnecting: { label: "RECONNECTING",   cls: "text-orange-400 border-orange-500/30"           },
    error:        { label: "WS ERROR",       cls: "text-red-400 border-red-500/30"                 },
    failed:       { label: "WS FAILED",      cls: "text-red-500 border-red-600/30"                 },
  };
  const { label, cls, dot } = map[status];
  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded border ${cls} bg-black/20`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />}
      {(status === "connecting" || status === "reconnecting") && (
        <span className="w-2.5 h-2.5 rounded-full border border-current border-t-transparent animate-spin" />
      )}
      {label}
    </span>
  );
}

// ─── SessionBadge ────────────────────────────────────────────────────────────
function SessionBadge({ s }: { s: SessionInfo }) {
  const short: Record<string, string> = { "United States": "US", "Europe": "EU", "Asia/Pacific": "APAC", "Forex/Crypto": "FX" };
  const lbl = short[s.region] ?? s.region.slice(0, 4).toUpperCase();
  const open = s.status === "open";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border ${
      open ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-300" : "border-slate-700 text-slate-600"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${open ? "bg-emerald-400 animate-pulse" : "bg-slate-700"}`} />
      {lbl} {open ? "OPEN" : "CLOSED"}
    </span>
  );
}

// ─── FearGreedGauge ───────────────────────────────────────────────────────────
function FearGreedGauge({ score }: { score: number }) {
  const { label, color, ringColor } = fgMeta(score);
  const angle = -135 + (score / 100) * 270;
  const cx = 70, cy = 70, r = 52;
  const arc = (s: number, e: number, col: string) => {
    const rad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad(s)), y1 = cy + r * Math.sin(rad(s));
    const x2 = cx + r * Math.cos(rad(e)), y2 = cy + r * Math.sin(rad(e));
    return <path d={`M${x1} ${y1} A${r} ${r} 0 ${e-s>180?1:0} 1 ${x2} ${y2}`} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" />;
  };
  return (
    <div className="flex flex-col items-center">
      <svg width={140} height={88} viewBox="0 0 140 88">
        {arc(-135, -45, "#ef4444")}{arc(-45, 0, "#f97316")}{arc(0, 45, "#fbbf24")}{arc(45, 90, "#34d399")}{arc(90, 135, "#10b981")}
        <line x1={cx} y1={cy} x2={cx + (r-12)*Math.cos(angle*Math.PI/180)} y2={cy + (r-12)*Math.sin(angle*Math.PI/180)} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={color} style={{ filter: `drop-shadow(0 0 4px ${ringColor})` }} />
        <text x={cx} y={cy+20} textAnchor="middle" fontSize="20" fontWeight="800" fill={color} fontFamily="monospace">{score}</text>
      </svg>
      <span className="text-[10px] font-mono font-bold tracking-widest -mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

// ─── IndexCard ────────────────────────────────────────────────────────────────
function IndexCard({ label, q, isLive, onClick }: { label: string; q: Quote; isLive?: boolean; onClick?: () => void }) {
  const spark    = useMemo(() => sparkPoints(q.price, q.change), [q.symbol, q.price]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevRef  = useRef(q.price);
  const flashDir = q.price > prevRef.current ? "up" : q.price < prevRef.current ? "down" : null;
  prevRef.current = q.price;
  const up = isPos(q.changePct);

  const displayPrice = q.symbol === "BTC"
    ? `$${q.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : q.symbol === "EUR/USD" || q.symbol === "EURUSD"
    ? q.price.toFixed(4)
    : fmtUsd(q.price);

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl border p-4 overflow-hidden transition-all duration-200 ${onClick ? "cursor-pointer hover:scale-[1.02] hover:border-opacity-60" : "cursor-default"} ${
        up ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-red-500/20 bg-red-500/[0.04]"
      } ${flashDir === "up" ? "animate-flash-green" : flashDir === "down" ? "animate-flash-red" : ""}`}
      style={{ backdropFilter: "blur(12px)" }}
    >
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at top right, ${up ? "#10b981" : "#ef4444"}18 0%, transparent 65%)` }} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono font-bold text-slate-500 tracking-widest">{label}</span>
          <div className="flex items-center gap-1.5">
            {isLive && <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />LIVE</span>}
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${bgCls(q.changePct)}`}>{fmtPct(q.changePct)}</span>
          </div>
        </div>
        <div className={`text-xl font-mono font-bold mb-2 ${flashDir === "up" ? "text-emerald-300" : flashDir === "down" ? "text-red-300" : "text-white"}`}>
          {displayPrice}
        </div>
        <div className="h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`sg-${q.symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={clrPos(q.changePct)} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={clrPos(q.changePct)} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={clrPos(q.changePct)} strokeWidth={1.5} fill={`url(#sg-${q.symbol})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-between mt-1 text-[10px] font-mono text-slate-600">
          <span>{q.change >= 0 ? "▲" : "▼"} {Math.abs(q.change).toFixed(q.symbol === "EUR/USD" || q.symbol === "EURUSD" ? 4 : 2)}</span>
          {q.volume > 0 && <span>{fmtVol(q.volume)} vol</span>}
        </div>
      </div>
    </div>
  );
}

// ─── SectorBar chart ─────────────────────────────────────────────────────────
function SectorBarChart({ sectors }: { sectors: Record<string, number> }) {
  const data = Object.entries(sectors).sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ name: n.replace("Consumer ", "Cns.").replace(" Care", ""), v }));
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 6, right: 36, top: 2, bottom: 2 }}>
          <XAxis type="number" domain={["auto","auto"]} tick={{ fill:"#475569", fontSize:9, fontFamily:"monospace" }} axisLine={false} tickLine={false} tickFormatter={v => `${v>0?"+":""}${v.toFixed(1)}%`} />
          <YAxis type="category" dataKey="name" width={80} tick={{ fill:"#64748b", fontSize:9, fontFamily:"monospace" }} axisLine={false} tickLine={false} />
          <RTooltip contentStyle={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, fontSize:11 }} formatter={(v: number) => [`${v>=0?"+":""}${v.toFixed(2)}%`, "Performance"]} />
          <Bar dataKey="v" radius={2} barSize={8}>
            {data.map((d, i) => <Cell key={i} fill={clrPos(d.v)} fillOpacity={0.8} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Region heatmap tile ─────────────────────────────────────────────────────
function RegionTile({ item, active, onClick }: { item: typeof REGIONS[0]; active: boolean; onClick: () => void }) {
  const intensity = Math.min(Math.abs(item.change) / 1.5, 1);
  const up = item.change >= 0;
  const bg = up ? `rgba(16,185,129,${0.08+intensity*0.35})` : `rgba(239,68,68,${0.08+intensity*0.35})`;
  const border = up ? `rgba(16,185,129,${0.12+intensity*0.3})` : `rgba(239,68,68,${0.12+intensity*0.3})`;
  return (
    <button onClick={onClick} className={`rounded-lg p-2.5 flex flex-col justify-between min-h-[58px] text-left w-full transition-all hover:scale-[1.04] ${active ? "ring-2 ring-cyan-500/50" : ""}`}
      style={{ background: bg, border: `1px solid ${border}` }}>
      <span className="text-[10px] font-mono text-slate-300 leading-tight">{item.label}</span>
      <span className={`text-sm font-mono font-bold ${up ? "text-emerald-300" : "text-red-300"}`}>{fmtPct(item.change)}</span>
    </button>
  );
}

// ─── Stock row (table) ────────────────────────────────────────────────────────
function StockTableRow({ rank, item, quote, isLoading, onClick, isActive }: {
  rank: number; item: StockItem; quote?: YfQuote; isLoading: boolean;
  onClick: () => void; isActive: boolean;
}) {
  const q = quote;
  const up = isPos(q?.changePct ?? 0);
  return (
    <tr
      onClick={onClick}
      className={`border-b border-slate-800/50 cursor-pointer transition-all ${isActive ? "bg-cyan-500/5" : "hover:bg-slate-800/40"}`}
    >
      <td className="py-3 pl-4 pr-2 text-[10px] font-mono text-slate-600">{rank}</td>
      <td className="py-3 pr-3">
        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-[9px] font-mono font-black border ${up ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/8" : "border-red-500/30 text-red-400 bg-red-500/8"}`}>
          {item.symbol.replace("-USD","").slice(0,4)}
        </div>
      </td>
      <td className="py-3 pr-6">
        <div className="font-mono font-bold text-white text-sm">{item.symbol.replace("-USD","")}</div>
        <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{item.name}</div>
      </td>
      <td className="py-3 pr-4">
        {isLoading ? <div className="h-4 w-20 bg-slate-800 rounded animate-pulse" /> : (
          <span className="font-mono font-bold text-white text-sm">{q ? fmtUsd(q.price) : "—"}</span>
        )}
      </td>
      <td className="py-3 pr-4">
        {isLoading ? <div className="h-5 w-16 bg-slate-800 rounded animate-pulse" /> : q ? (
          <span className={`font-mono font-bold text-xs px-2 py-1 rounded ${bgCls(q.changePct)}`}>{fmtPct(q.changePct)}</span>
        ) : "—"}
      </td>
      <td className="py-3 pr-4 hidden md:table-cell">
        <span className="font-mono text-slate-400 text-xs">{q ? fmtVol(q.volume) : "—"}</span>
      </td>
      <td className="py-3 pr-4 hidden lg:table-cell">
        <span className="font-mono text-slate-400 text-xs">{fmtCap(q?.marketCap)}</span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-[9px] font-mono text-slate-600 bg-slate-800/60 border border-slate-700/50 px-1.5 py-0.5 rounded">{item.sector.toUpperCase()}</span>
      </td>
    </tr>
  );
}

// ─── Mover card ───────────────────────────────────────────────────────────────
function MoverCard({ m, dir, onClick }: { m: Mover; dir: "up" | "down"; onClick: () => void }) {
  const up = dir === "up";
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all hover:scale-[1.01] text-left ${
      up ? "border-emerald-500/15 bg-emerald-500/[0.04] hover:bg-emerald-500/8" : "border-red-500/15 bg-red-500/[0.04] hover:bg-red-500/8"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-9 h-9 rounded-lg text-[10px] font-black border ${up ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"}`}>
          {m.ticker.slice(0, 4)}
        </div>
        <div>
          <div className="font-mono font-bold text-white text-sm">{m.ticker}</div>
          <div className="text-[10px] font-mono text-slate-500">{fmtVol(m.volume)} vol</div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono font-bold text-white text-sm">{fmtUsd(m.price)}</div>
        <div className={`text-xs font-mono font-bold px-2 py-0.5 rounded mt-0.5 ${bgCls(m.changePct)}`}>{fmtPct(m.changePct)}</div>
      </div>
    </button>
  );
}

// ─── Sector heatmap tile (large) ──────────────────────────────────────────────
function SectorTile({ name, value }: { name: string; value: number }) {
  const up = isPos(value);
  const intensity = Math.min(Math.abs(value) / 3, 1);
  const bg = up ? `rgba(16,185,129,${0.06+intensity*0.28})` : `rgba(239,68,68,${0.06+intensity*0.28})`;
  const border = up ? `rgba(16,185,129,${0.1+intensity*0.25})` : `rgba(239,68,68,${0.1+intensity*0.25})`;
  return (
    <div className="rounded-xl p-4 flex flex-col justify-between min-h-[80px] cursor-default hover:scale-[1.02] transition-all"
      style={{ background: bg, border: `1px solid ${border}` }}>
      <span className="text-[10px] font-mono text-slate-300 leading-tight">{name.replace("Consumer ", "Cns. ").replace(" Care", " Care")}</span>
      <span className={`text-lg font-mono font-bold ${up ? "text-emerald-300" : "text-red-300"}`}>{fmtPct(value)}</span>
      <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(intensity * 100, 100)}%`, background: up ? "#10b981" : "#ef4444", opacity: 0.7 }} />
      </div>
    </div>
  );
}

// ─── News card ────────────────────────────────────────────────────────────────
function NewsCard({ item }: { item: NewsItem }) {
  const sentMap: Record<string, { cls: string; label: string }> = {
    "Bullish":           { cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/25", label: "Bullish"     },
    "Somewhat-Bullish":  { cls: "text-emerald-400 bg-emerald-500/6 border-emerald-500/15",  label: "~Bullish"    },
    "Neutral":           { cls: "text-amber-300 bg-amber-500/10 border-amber-500/25",       label: "Neutral"     },
    "Somewhat-Bearish":  { cls: "text-red-400 bg-red-500/6 border-red-500/15",              label: "~Bearish"    },
    "Bearish":           { cls: "text-red-300 bg-red-500/10 border-red-500/25",             label: "Bearish"     },
  };
  const { cls, label } = sentMap[item.label] ?? sentMap["Neutral"];
  const barW = Math.min(Math.abs(item.score) * 100, 100);
  const barCol = item.score > 0 ? "#10b981" : item.score < 0 ? "#ef4444" : "#fbbf24";

  return (
    <a href={item.url || "#"} target="_blank" rel="noopener noreferrer"
      className="block p-4 rounded-xl border border-slate-800/60 bg-slate-900/30 hover:bg-slate-800/50 hover:border-slate-700/60 transition-all group">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm text-slate-200 leading-snug group-hover:text-white transition-colors line-clamp-2">{item.title}</p>
        <span className={`shrink-0 text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${cls}`}>{label}</span>
      </div>
      {item.summary && <p className="text-[11px] text-slate-500 line-clamp-2 mb-2 leading-relaxed">{item.summary}</p>}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${barW}%`, background: barCol, opacity: 0.7 }} />
        </div>
        <span className="text-[10px] font-mono text-slate-600">{item.source}</span>
        <span className="text-[10px] font-mono text-slate-700">{newsTime(item.published)}</span>
      </div>
    </a>
  );
}

// ─── Stock Detail Panel ───────────────────────────────────────────────────────
function StockDetailPanel({ item, quote, onClose }: { item: StockItem | null; quote?: YfQuote; onClose: () => void }) {
  const [period, setPeriod] = useState<"1D" | "5D" | "1M">("1D");
  const spark = useMemo(
    () => quote ? sparkPoints(quote.price, quote.change, period === "1D" ? 24 : period === "5D" ? 60 : 120) : [],
    [quote?.symbol, quote?.price, period] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!item) return null;
  const q = quote;
  const up = isPos(q?.changePct ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative w-full max-w-md h-full overflow-y-auto animate-slide-in-right flex flex-col"
        style={{ background: "linear-gradient(180deg, #060d1a 0%, #07101f 100%)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between px-6 py-5 border-b border-slate-800/60"
          style={{ background: "rgba(6,13,26,0.95)", backdropFilter: "blur(16px)" }}>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-2xl font-mono font-black text-white tracking-tight">{item.symbol.replace("-USD","")}</span>
              <span className="text-[9px] font-mono text-slate-600 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded">{item.sector.toUpperCase()}</span>
            </div>
            <p className="text-xs text-slate-500">{item.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-800/50 flex items-center justify-center text-slate-500 hover:text-white hover:border-slate-600 transition-all text-sm mt-1">
            ✕
          </button>
        </div>

        <div className="flex-1 px-6 py-4 space-y-5">
          {/* Price block */}
          <div>
            <div className={`text-4xl font-mono font-black ${up ? "text-emerald-300" : "text-red-300"}`}>
              {q ? fmtUsd(q.price) : "—"}
            </div>
            {q && (
              <div className="flex items-center gap-3 mt-1.5">
                <span className={`text-lg font-mono font-bold ${clrCls(q.change)}`}>
                  {q.change >= 0 ? "+" : ""}{q.change.toFixed(2)}
                </span>
                <span className={`font-mono font-bold text-sm px-2.5 py-1 rounded-lg ${bgCls(q.changePct)}`}>
                  {fmtPct(q.changePct)}
                </span>
              </div>
            )}
          </div>

          {/* Chart */}
          <div className="rounded-xl border border-slate-800/60 overflow-hidden" style={{ background: "rgba(7,16,31,0.6)" }}>
            <div className="flex gap-0 border-b border-slate-800/60">
              {(["1D","5D","1M"] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`flex-1 py-2 text-[11px] font-mono font-bold transition-all ${period === p ? "text-cyan-300 bg-cyan-500/8 border-b-2 border-cyan-400" : "text-slate-600 hover:text-slate-400"}`}>
                  {p}
                </button>
              ))}
            </div>
            <div className="h-40 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="detail-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={up ? "#10b981" : "#ef4444"} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={up ? "#10b981" : "#ef4444"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <RTooltip contentStyle={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:6, fontSize:11 }}
                    formatter={(v: number) => [fmtUsd(v), item.symbol]} />
                  <Area type="monotone" dataKey="v" stroke={up ? "#10b981" : "#ef4444"} strokeWidth={2} fill="url(#detail-grad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Key stats */}
          {q && (
            <div>
              <p className="text-[9px] font-mono font-bold text-slate-600 tracking-widest mb-3">KEY STATISTICS</p>
              <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-slate-800/50">
                {[
                  { label: "OPEN",       val: q.previousClose != null ? fmtUsd(q.previousClose) : "—" },
                  { label: "VOLUME",     val: fmtVol(q.volume) },
                  { label: "DAY HIGH",   val: q.dayHigh ? fmtUsd(q.dayHigh) : "—" },
                  { label: "DAY LOW",    val: q.dayLow ? fmtUsd(q.dayLow) : "—" },
                  { label: "MKT CAP",   val: fmtCap(q.marketCap) },
                  { label: "52W HIGH",  val: q.week52High ? fmtUsd(q.week52High) : "—" },
                  { label: "52W LOW",   val: q.week52Low ? fmtUsd(q.week52Low) : "—" },
                  { label: "TRAIL P/E", val: q.trailingPE ? q.trailingPE.toFixed(1) : "—" },
                  { label: "FWD P/E",   val: q.forwardPE ? q.forwardPE.toFixed(1) : "—" },
                  { label: "BETA",      val: q.beta ? q.beta.toFixed(2) : "—" },
                ].map(({ label, val }) => (
                  <div key={label} className="px-4 py-3 bg-slate-900/50 flex flex-col gap-1">
                    <span className="text-[9px] font-mono text-slate-600 tracking-widest">{label}</span>
                    <span className="text-sm font-mono font-bold text-white">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 52W range bar */}
          {q?.week52High && q?.week52Low && (
            <div>
              <p className="text-[9px] font-mono font-bold text-slate-600 tracking-widest mb-2">52-WEEK RANGE</p>
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden relative">
                  <div className="absolute h-full rounded-full" style={{
                    left: 0,
                    width: `${Math.max(2, Math.min(98, ((q.price - q.week52Low) / (q.week52High - q.week52Low)) * 100))}%`,
                    background: `linear-gradient(90deg, ${up ? "#059669" : "#dc2626"}, ${up ? "#10b981" : "#ef4444"})`,
                  }} />
                </div>
                <div className="flex justify-between text-[9px] font-mono text-slate-600">
                  <span>{fmtUsd(q.week52Low)}</span>
                  <span>{fmtUsd(q.week52High)}</span>
                </div>
              </div>
            </div>
          )}

          <p className="text-[9px] text-slate-700 font-mono pb-4">* Chart data is indicative. Powered by Yahoo Finance.</p>
        </div>
      </aside>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MarketsPage() {
  // Data
  const { data, isLoading, mutate } = useSWR<MarketSnapshot>("/api/market", fetcher, { refreshInterval: 5 * 60_000 });
  const { liveQuotes, status: wsStatus } = useFinnhubWs(Object.values(FH_SYMBOLS));

  // UI state
  const [activeTab, setActiveTab]         = useState<Tab>("overview");
  const [sector, setSector]               = useState<SectorFilter>("Technology");
  const [sortKey, setSortKey]             = useState<SortKey>("changePct");
  const [sortDir, setSortDir]             = useState<SortDir>("desc");
  const [search, setSearch]               = useState("");
  const [moversView, setMoversView]       = useState<MoversView>("gainers");
  const [newsSentiment, setNewsSentiment] = useState<NewsSentiment>("All");
  const [selectedItem, setSelectedItem]   = useState<StockItem | null>(null);
  const [activeRegion, setActiveRegion]   = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const snap = data as MarketSnapshot | undefined;

  // Merge WS ticks over REST quotes
  const mergedQuotes = useMemo<Record<string, Quote>>(() => {
    if (!snap?.quotes) return {};
    const out = { ...snap.quotes };
    for (const [ourKey, fhSym] of Object.entries(FH_SYMBOLS)) {
      const tick = liveQuotes[fhSym], base = out[ourKey];
      if (!tick || !base) continue;
      const change = tick.price - base.previousClose;
      out[ourKey] = { ...base, price: tick.price, change, changePct: base.previousClose > 0 ? (change/base.previousClose)*100 : 0 };
    }
    return out;
  }, [snap?.quotes, liveQuotes]);

  const fg = snap ? fearGreedScore(snap.sectors) : 50;
  const { label: fgLbl, color: fgClr } = fgMeta(fg);

  // Stock list for STOCKS tab
  const visibleStocks = useMemo(() => {
    const q = search.toLowerCase();
    const pool = q
      ? UNIVERSE.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      : sector === "All" ? UNIVERSE : UNIVERSE.filter(s => s.sector === sector);
    return pool;
  }, [sector, search]);

  const symbolsKey = visibleStocks.map(s => s.symbol).join(",");
  const { data: yfData, isLoading: yfLoading } = useSWR<YfQuote[]>(
    symbolsKey ? `/api/quotes?symbols=${symbolsKey}` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );
  const yfMap = useMemo<Record<string, YfQuote>>(() => {
    if (!yfData) return {};
    return Object.fromEntries(yfData.map(q => [q.symbol, q]));
  }, [yfData]);

  // For selected stock detail — also lookup in yfMap
  const selectedQuote = selectedItem ? yfMap[selectedItem.symbol] : undefined;

  // Sort stocks
  const sortedStocks = useMemo(() => {
    return [...visibleStocks].sort((a, b) => {
      const qa = yfMap[a.symbol], qb = yfMap[b.symbol];
      if (!qa && !qb) return 0;
      if (!qa) return 1; if (!qb) return -1;
      const va = qa[sortKey] ?? 0, vb = qb[sortKey] ?? 0;
      return sortDir === "desc" ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });
  }, [visibleStocks, yfMap, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }, [sortKey]);

  // Filtered news
  const filteredNews = useMemo(() => {
    if (!snap?.news) return [];
    if (newsSentiment === "All") return snap.news;
    return snap.news.filter(n =>
      newsSentiment === "Bullish" ? n.label.includes("Bullish") :
      newsSentiment === "Bearish" ? n.label.includes("Bearish") :
      n.label === "Neutral"
    );
  }, [snap?.news, newsSentiment]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "OVERVIEW" },
    { id: "stocks",   label: "STOCKS"   },
    { id: "movers",   label: "MOVERS"   },
    { id: "sectors",  label: "SECTORS"  },
    { id: "news",     label: "NEWS"     },
  ];

  const quoteList: [string, string][] = [["S&P 500","SPY"],["NASDAQ","QQQ"],["Gold","GLD"],["Bitcoin","BTC"],["EUR/USD","EURUSD"]];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #040c1a 0%, #060e1e 60%, #050b17 100%)" }}>

      {/* ── Sticky Header ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-800/50"
        style={{ background: "rgba(4,12,26,0.92)", backdropFilter: "blur(20px)" }}>
        {/* Top row */}
        <div className="flex items-center justify-between px-6 py-3 gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white font-mono tracking-tight">ALPHA SCREEN</span>
                <span className="text-[9px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
              </div>
              <LiveClock />
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-sm pointer-events-none">⌕</span>
            <input ref={searchRef} value={search} onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveTab("stocks"); }}
              placeholder="Search stocks, ETFs, crypto…"
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg pl-8 pr-10 py-2 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 text-xs">✕</button>
            )}
          </div>

          {/* Right — Fear/Greed + status */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden xl:flex items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-600">F&G</span>
              <span className="font-bold text-lg" style={{ color: fgClr }}>{fg}</span>
              <span className="font-bold text-[10px]" style={{ color: fgClr }}>{fgLbl}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <WsStatusBadge status={wsStatus} />
              {snap?.sessions.slice(0,3).map((s, i) => <SessionBadge key={i} s={s} />) ?? null}
              <button onClick={() => mutate()} className="text-[10px] font-mono text-slate-600 hover:text-slate-400 border border-slate-800 rounded px-2 py-1 hover:border-slate-700 transition-all">↺</button>
            </div>
          </div>
        </div>

        {/* Ticker tape */}
        {snap && <TickerTape quotes={snap.quotes} mergedQuotes={mergedQuotes} />}

        {/* Tab bar */}
        <div className="flex border-t border-slate-800/50 px-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`relative py-2.5 px-4 text-[11px] font-mono font-bold tracking-widest transition-all ${
                activeTab === t.id ? "text-cyan-300" : "text-slate-600 hover:text-slate-400"
              }`}>
              {t.label}
              {activeTab === t.id && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-cyan-400 rounded-full" />}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 px-6 py-5">

        {/* ══ OVERVIEW TAB ════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-5 animate-fade-in">
            {/* Index cards + Fear&Greed */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {quoteList.map(([name, sym]) => {
                const q = mergedQuotes[sym] ?? snap?.quotes?.[sym];
                const fhSym = FH_SYMBOLS[sym];
                const isLive = wsStatus === "connected" && !!fhSym && !!liveQuotes[fhSym];
                if (!q) return (
                  <div key={sym} className="rounded-xl border border-slate-800 p-4 animate-pulse">
                    <div className="h-2.5 bg-slate-800 rounded mb-2 w-14" /><div className="h-5 bg-slate-800 rounded mb-3 w-20" /><div className="h-10 bg-slate-800 rounded" />
                  </div>
                );
                return <IndexCard key={sym} label={name} q={q} isLive={isLive} onClick={() => { setActiveTab("stocks"); setSearch(sym.replace("USD","").replace("-","")); }} />;
              })}
              {/* Fear & Greed card */}
              <div className="rounded-xl border border-slate-700/40 p-4 flex flex-col items-center justify-center col-span-1"
                style={{ background: "rgba(7,14,27,0.7)", backdropFilter: "blur(12px)" }}>
                <p className="text-[9px] font-mono text-slate-600 tracking-widest mb-1">FEAR & GREED</p>
                <FearGreedGauge score={fg} />
              </div>
            </div>

            {/* Global heatmap */}
            <div className="rounded-xl border border-slate-800/50 p-5" style={{ background: "rgba(7,14,27,0.7)", backdropFilter: "blur(12px)" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-mono font-bold text-white tracking-widest">GLOBAL EQUITY HEATMAP</h2>
                <span className="text-[10px] text-slate-600 font-mono">24h performance · click to highlight</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {(["Americas","Europe","Asia/Pacific","EM"] as const).map(grp => (
                  <div key={grp}>
                    <p className="text-[9px] font-mono text-slate-600 mb-2 tracking-widest uppercase">{grp}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {REGIONS.filter(r => r.region === grp).map(r => (
                        <RegionTile key={r.id} item={r} active={activeRegion === r.id} onClick={() => setActiveRegion(v => v === r.id ? null : r.id)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sector + Movers 2-col */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-xl border border-slate-800/50 p-5" style={{ background: "rgba(7,14,27,0.7)", backdropFilter: "blur(12px)" }}>
                <h2 className="text-xs font-mono font-bold text-white tracking-widest mb-4">SECTOR ROTATION</h2>
                {snap?.sectors ? <SectorBarChart sectors={snap.sectors} /> : <div className="h-60 flex items-center justify-center text-slate-700 font-mono text-xs animate-pulse">Loading…</div>}
              </div>
              <div className="rounded-xl border border-slate-800/50 p-5" style={{ background: "rgba(7,14,27,0.7)", backdropFilter: "blur(12px)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-mono font-bold text-white tracking-widest">MARKET MOVERS</h2>
                  <div className="flex bg-slate-800/60 rounded-lg p-0.5 text-[10px] font-mono">
                    <button onClick={() => setMoversView("gainers")} className={`px-3 py-1 rounded-md transition-all ${moversView==="gainers" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-600 hover:text-slate-400"}`}>GAINERS</button>
                    <button onClick={() => setMoversView("losers")} className={`px-3 py-1 rounded-md transition-all ${moversView==="losers" ? "bg-red-500/20 text-red-300" : "text-slate-600 hover:text-slate-400"}`}>LOSERS</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {(moversView === "gainers" ? snap?.gainers : snap?.losers)?.map((m, i) => (
                    <MoverCard key={i} m={m} dir={moversView === "gainers" ? "up" : "down"} onClick={() => { setSearch(m.ticker); setActiveTab("stocks"); }} />
                  )) ?? Array(5).fill(0).map((_, i) => <div key={i} className="h-[52px] rounded-xl bg-slate-800/40 animate-pulse" />)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ STOCKS TAB ══════════════════════════════════════════════════ */}
        {activeTab === "stocks" && (
          <div className="animate-fade-in space-y-3">
            {/* Sector filter chips */}
            <div className="flex gap-2 flex-wrap">
              {SECTOR_FILTERS.map(f => (
                <button key={f} onClick={() => { setSector(f); setSearch(""); }}
                  className={`px-3.5 py-1.5 rounded-full text-[10px] font-mono font-bold tracking-wide border transition-all ${
                    sector === f && !search ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300" : "border-slate-700/50 text-slate-600 hover:text-slate-400 hover:border-slate-600"
                  }`}>{f.toUpperCase()}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-slate-600">
                <span>{sortedStocks.length} stocks</span>
                {yfLoading && <span className="text-cyan-600 animate-pulse">Fetching quotes…</span>}
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-slate-800/50 overflow-hidden" style={{ background: "rgba(7,14,27,0.7)" }}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/60">
                    <th className="py-2.5 pl-4 pr-2 text-[9px] font-mono text-slate-600 text-left w-8">#</th>
                    <th className="py-2.5 pr-3 w-10" />
                    <th className="py-2.5 pr-6 text-[9px] font-mono text-slate-600 text-left">TICKER</th>
                    <th className="py-2.5 pr-4 text-[9px] font-mono text-left">
                      <button onClick={() => toggleSort("price")} className="text-slate-600 hover:text-slate-300 transition-colors flex items-center gap-1">
                        PRICE {sortKey === "price" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                      </button>
                    </th>
                    <th className="py-2.5 pr-4 text-[9px] font-mono text-left">
                      <button onClick={() => toggleSort("changePct")} className="text-slate-600 hover:text-slate-300 transition-colors flex items-center gap-1">
                        CHANGE% {sortKey === "changePct" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                      </button>
                    </th>
                    <th className="py-2.5 pr-4 text-[9px] font-mono text-left hidden md:table-cell">
                      <button onClick={() => toggleSort("volume")} className="text-slate-600 hover:text-slate-300 transition-colors flex items-center gap-1">
                        VOLUME {sortKey === "volume" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                      </button>
                    </th>
                    <th className="py-2.5 pr-4 text-[9px] font-mono text-left hidden lg:table-cell">
                      <button onClick={() => toggleSort("marketCap")} className="text-slate-600 hover:text-slate-300 transition-colors flex items-center gap-1">
                        MKT CAP {sortKey === "marketCap" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                      </button>
                    </th>
                    <th className="py-2.5 pr-4 text-[9px] font-mono text-slate-600 text-left">SECTOR</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStocks.map((item, i) => (
                    <StockTableRow
                      key={item.symbol}
                      rank={i + 1}
                      item={item}
                      quote={yfMap[item.symbol]}
                      isLoading={yfLoading && !yfMap[item.symbol]}
                      isActive={selectedItem?.symbol === item.symbol}
                      onClick={() => setSelectedItem(v => v?.symbol === item.symbol ? null : item)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ MOVERS TAB ══════════════════════════════════════════════════ */}
        {activeTab === "movers" && (
          <div className="animate-fade-in space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setMoversView("gainers")}
                className={`px-5 py-2 rounded-xl text-sm font-mono font-bold border transition-all ${moversView==="gainers" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "border-slate-700 text-slate-600 hover:text-slate-400"}`}>
                ▲ TOP GAINERS
              </button>
              <button onClick={() => setMoversView("losers")}
                className={`px-5 py-2 rounded-xl text-sm font-mono font-bold border transition-all ${moversView==="losers" ? "bg-red-500/10 border-red-500/30 text-red-300" : "border-slate-700 text-slate-600 hover:text-slate-400"}`}>
                ▼ TOP LOSERS
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {((moversView === "gainers" ? snap?.gainers : snap?.losers) ?? Array(5).fill(null)).map((m: Mover | null, i: number) =>
                m ? <MoverCard key={i} m={m} dir={moversView === "gainers" ? "up" : "down"} onClick={() => { setSearch(m.ticker); setActiveTab("stocks"); }} />
                  : <div key={i} className="h-[60px] rounded-xl bg-slate-800/40 animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* ══ SECTORS TAB ═════════════════════════════════════════════════ */}
        {activeTab === "sectors" && (
          <div className="animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono font-bold text-white tracking-widest">SECTOR PERFORMANCE TODAY</h2>
              <span className="text-[10px] text-slate-600 font-mono">Real-Time · S&P 500 sectors</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {snap?.sectors ? Object.entries(snap.sectors).sort((a,b) => b[1]-a[1]).map(([name, val]) => (
                <SectorTile key={name} name={name} value={val} />
              )) : Array(11).fill(0).map((_,i) => <div key={i} className="h-20 rounded-xl bg-slate-800/40 animate-pulse" />)}
            </div>
            <div className="rounded-xl border border-slate-800/50 p-5" style={{ background: "rgba(7,14,27,0.7)" }}>
              <h3 className="text-[9px] font-mono text-slate-600 tracking-widest mb-4">PERFORMANCE CHART</h3>
              {snap?.sectors && <SectorBarChart sectors={snap.sectors} />}
            </div>
          </div>
        )}

        {/* ══ NEWS TAB ════════════════════════════════════════════════════ */}
        {activeTab === "news" && (
          <div className="animate-fade-in space-y-4">
            {/* Sentiment filter + bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-2">
                {(["All","Bullish","Neutral","Bearish"] as NewsSentiment[]).map(s => (
                  <button key={s} onClick={() => setNewsSentiment(s)}
                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-mono font-bold border transition-all ${
                      newsSentiment === s
                        ? s === "Bullish" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : s === "Bearish" ? "bg-red-500/10 border-red-500/30 text-red-300"
                          : s === "Neutral" ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                          : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                        : "border-slate-700/50 text-slate-600 hover:text-slate-400"
                    }`}>{s.toUpperCase()}
                  </button>
                ))}
              </div>
              {snap?.news && (() => {
                const b = snap.news.filter(n => n.label.includes("Bullish")).length;
                const r = snap.news.filter(n => n.label.includes("Bearish")).length;
                const t = snap.news.length || 1;
                const bp = Math.round(b/t*100), rp = Math.round(r/t*100);
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-emerald-400">B {bp}%</span>
                    <div className="w-32 h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${bp}%` }} />
                      <div className="h-full bg-slate-700 flex-1" />
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${rp}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-red-400">B {rp}%</span>
                  </div>
                );
              })()}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredNews.length ? filteredNews.map((item, i) => <NewsCard key={i} item={item} />) : (
                <div className="col-span-2 py-16 text-center text-slate-700 font-mono text-xs">No {newsSentiment} news found.</div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-700 mt-6 pt-4 border-t border-slate-800/40">
          <span>{snap ? `Updated ${new Date(snap.fetchedAt).toLocaleTimeString()} · auto-refresh 5 min` : isLoading ? "Loading…" : "—"}</span>
          <span>Powered by Alpha Vantage · Yahoo Finance · Finnhub</span>
        </div>
      </main>

      {/* ── Stock Detail Panel ───────────────────────────────────────────── */}
      {selectedItem && (
        <StockDetailPanel item={selectedItem} quote={selectedQuote} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
