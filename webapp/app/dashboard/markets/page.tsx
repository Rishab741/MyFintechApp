"use client";

import useSWR from "swr";
import { useMemo, useRef } from "react";
import {
  ResponsiveContainer,
  AreaChart, Area, Tooltip as RTooltip,
  BarChart, Bar, Cell, XAxis, YAxis,
} from "recharts";
import type { MarketSnapshot, Quote, Mover, SessionInfo, NewsItem } from "@/lib/alpha-vantage";
import { useFinnhubWs, type WsStatus } from "@/hooks/use-finnhub-ws";

const fetcher = (url: string) => fetch(url).then(r => r.json());

// Finnhub symbol map: our internal key → Finnhub symbol
const FH_SYMBOLS: Record<string, string> = {
  SPY:    "SPY",
  QQQ:    "QQQ",
  GLD:    "GLD",
  BTC:    "BINANCE:BTCUSDT",
  // EUR/USD requires Finnhub premium — omit from WS, keep REST value
};

// ── Colour helpers ────────────────────────────────────────────────────────────
const pos  = (v: number) => v >= 0;
const pct  = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const usd  = (v: number, decimals = 2) =>
  v >= 1000 ? `$${(v / 1000).toFixed(2)}k` : `$${v.toFixed(decimals)}`;
const clr  = (v: number) => v >= 0 ? "#10b981" : "#ef4444";
const bg   = (v: number) => v >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)";

// ── Synthetic sparkline (7-point walk from prev close to current price) ───────
function sparkData(q: Quote) {
  const steps = 7;
  const diff  = q.price - q.previousClose;
  return Array.from({ length: steps }, (_, i) => ({
    v: q.previousClose + diff * (i / (steps - 1)) + (Math.random() - 0.5) * Math.abs(diff) * 0.3,
  }));
}

// ── Fear & Greed calculation from sector data ─────────────────────────────────
function fearGreed(sectors: Record<string, number>): number {
  const vals = Object.values(sectors);
  if (!vals.length) return 50;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(0, Math.min(100, Math.round(50 + avg * 12)));
}

function fgLabel(score: number) {
  if (score >= 75) return { label: "EXTREME GREED", color: "#10b981" };
  if (score >= 55) return { label: "GREED",         color: "#34d399" };
  if (score >= 45) return { label: "NEUTRAL",        color: "#fbbf24" };
  if (score >= 25) return { label: "FEAR",           color: "#f97316" };
  return                  { label: "EXTREME FEAR",   color: "#ef4444" };
}

// ── Components ────────────────────────────────────────────────────────────────

function Pulse({ open }: { open: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {open && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${open ? "bg-emerald-400" : "bg-slate-600"}`} />
    </span>
  );
}

function SessionBadge({ s }: { s: SessionInfo }) {
  const short: Record<string, string> = {
    "United States": "US", "Europe": "EU", "Asia/Pacific": "ASIA", "Forex/Crypto": "FX/CRYPTO",
    "United Kingdom": "UK", "Japan": "JP", "China": "CN",
  };
  const label = short[s.region] ?? s.region.slice(0, 6).toUpperCase();
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-semibold transition-all ${
      s.status === "open"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
        : "border-slate-700 bg-slate-800/50 text-slate-500"
    }`}>
      <Pulse open={s.status === "open"} />
      {label}
      <span className="opacity-60">{s.status === "open" ? "OPEN" : "CLOSED"}</span>
    </div>
  );
}

function FearGreedGauge({ score }: { score: number }) {
  const { label, color } = fgLabel(score);
  const angle = -135 + (score / 100) * 270;
  const r = 54, cx = 70, cy = 70;
  const arcPath = (startDeg: number, endDeg: number, col: string) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return (
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
        fill="none" stroke={col} strokeWidth="8" strokeLinecap="round"
      />
    );
  };
  return (
    <div className="flex flex-col items-center">
      <svg width={140} height={90} viewBox="0 0 140 90">
        {arcPath(-135, -45, "#ef4444")}
        {arcPath(-45,   0,  "#f97316")}
        {arcPath(0,    45,  "#fbbf24")}
        {arcPath(45,   90,  "#34d399")}
        {arcPath(90,  135,  "#10b981")}
        <line
          x1={cx} y1={cy}
          x2={cx + (r - 10) * Math.cos((angle * Math.PI) / 180)}
          y2={cy + (r - 10) * Math.sin((angle * Math.PI) / 180)}
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="4" fill={color} />
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize="22" fontWeight="700" fill={color} fontFamily="monospace">{score}</text>
      </svg>
      <span className="text-xs font-mono font-bold tracking-widest mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

function IndexCard({ q, isLive }: { q: Quote; isLive?: boolean }) {
  const spark    = useMemo(() => sparkData(q), [q.symbol, q.price]); // eslint-disable-line react-hooks/exhaustive-deps
  const green    = pos(q.changePct);
  const prevRef  = useRef(q.price);
  const flashDir = q.price > prevRef.current ? "up" : q.price < prevRef.current ? "down" : null;
  prevRef.current = q.price;

  const displayPrice = q.symbol === "BTC"
    ? `$${q.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : q.symbol === "EUR/USD"
    ? q.price.toFixed(4)
    : `$${q.price.toFixed(2)}`;

  return (
    <div className={`relative rounded-xl border p-4 overflow-hidden transition-all hover:scale-[1.02] cursor-default ${
      green ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
    } ${flashDir === "up" ? "animate-flash-green" : flashDir === "down" ? "animate-flash-red" : ""}`}
      style={{ backdropFilter: "blur(12px)" }}>
      <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(ellipse at top right, ${green ? "#10b981" : "#ef4444"} 0%, transparent 70%)` }} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono font-bold text-slate-400 tracking-wider">{q.symbol}</span>
          <div className="flex items-center gap-1.5">
            {isLive && (
              <span className="flex items-center gap-1 text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                LIVE
              </span>
            )}
            <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${green ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
              {pct(q.changePct)}
            </span>
          </div>
        </div>
        <div className={`text-lg font-mono font-bold mb-2 transition-colors duration-300 ${
          flashDir === "up" ? "text-emerald-300" : flashDir === "down" ? "text-red-300" : "text-white"
        }`}>{displayPrice}</div>
        <div className="h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`sg-${q.symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={green ? "#10b981" : "#ef4444"} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={green ? "#10b981" : "#ef4444"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={green ? "#10b981" : "#ef4444"} strokeWidth={1.5}
                fill={`url(#sg-${q.symbol})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-600 font-mono">
            {q.change >= 0 ? "▲" : "▼"} {Math.abs(q.change).toFixed(2)}
          </span>
          {q.volume > 0 && (
            <span className="text-xs text-slate-600 font-mono">
              {(q.volume / 1_000_000).toFixed(1)}M vol
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SectorChart({ sectors }: { sectors: Record<string, number> }) {
  const data = Object.entries(sectors)
    .sort((a, b) => b[1] - a[1])
    .map(([name, val]) => ({ name: name.replace("Consumer ", "Cns."), val }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
          <XAxis type="number" domain={["auto", "auto"]} tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`} />
          <YAxis type="category" dataKey="name" width={88} tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
          <RTooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
            formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Performance"]}
          />
          <Bar dataKey="val" radius={2} barSize={10}>
            {data.map((d, i) => <Cell key={i} fill={clr(d.val)} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MoverRow({ m, dir }: { m: Mover; dir: "up" | "down" }) {
  const green = dir === "up";
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-lg border transition-colors hover:border-opacity-60 ${
      green ? "border-emerald-500/15 bg-emerald-500/5 hover:bg-emerald-500/10"
             : "border-red-500/15 bg-red-500/5 hover:bg-red-500/10"
    }`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold ${green ? "text-emerald-400" : "text-red-400"}`}>{green ? "▲" : "▼"}</span>
        <span className="font-mono font-bold text-white text-sm">{m.ticker}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-slate-300 text-sm">{usd(m.price)}</span>
        <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${
          green ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
        }`}>{pct(m.changePct)}</span>
      </div>
    </div>
  );
}

function SentimentBadge({ label }: { label: string }) {
  const map: Record<string, string> = {
    "Bullish":       "text-emerald-300 bg-emerald-500/10 border-emerald-500/25",
    "Somewhat-Bullish": "text-emerald-400 bg-emerald-500/5 border-emerald-500/15",
    "Neutral":       "text-amber-300 bg-amber-500/10 border-amber-500/25",
    "Somewhat-Bearish": "text-red-400 bg-red-500/5 border-red-500/15",
    "Bearish":       "text-red-300 bg-red-500/10 border-red-500/25",
  };
  return (
    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${map[label] ?? map["Neutral"]}`}>
      {label.replace("Somewhat-", "~")}
    </span>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  const time = item.published
    ? new Date(item.published.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  return (
    <a href={item.url || "#"} target="_blank" rel="noopener noreferrer"
      className="flex flex-col gap-1 py-2.5 border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors px-1 group">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-200 leading-snug group-hover:text-white transition-colors line-clamp-2">{item.title}</p>
        <SentimentBadge label={item.label} />
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
        <span>{item.source}</span>
        {time && <><span>·</span><span>{time}</span></>}
      </div>
    </a>
  );
}

// ── World region heatmap ──────────────────────────────────────────────────────

const REGIONS = [
  { id: "US",    label: "S&P 500",  region: "Americas",      change:  0.62 },
  { id: "NDQ",   label: "NASDAQ",   region: "Americas",      change:  0.44 },
  { id: "TSX",   label: "TSX",      region: "Americas",      change:  0.18 },
  { id: "MEX",   label: "IPC",      region: "Americas",      change: -0.31 },
  { id: "UK",    label: "FTSE 100", region: "Europe",        change: -0.12 },
  { id: "GER",   label: "DAX",      region: "Europe",        change:  0.35 },
  { id: "FRA",   label: "CAC 40",   region: "Europe",        change:  0.21 },
  { id: "ITA",   label: "FTSE MIB", region: "Europe",        change:  0.09 },
  { id: "JP",    label: "Nikkei",   region: "Asia/Pacific",  change: -0.54 },
  { id: "CN",    label: "Shanghai", region: "Asia/Pacific",  change: -1.12 },
  { id: "HK",    label: "Hang Seng",region: "Asia/Pacific",  change: -0.88 },
  { id: "AU",    label: "ASX 200",  region: "Asia/Pacific",  change:  0.14 },
  { id: "IN",    label: "Nifty 50", region: "Asia/Pacific",  change:  0.73 },
  { id: "KR",    label: "KOSPI",    region: "Asia/Pacific",  change: -0.22 },
  { id: "BR",    label: "Bovespa",  region: "EM",            change:  0.55 },
  { id: "ZA",    label: "JSE",      region: "EM",            change: -0.19 },
];

function RegionTile({ item }: { item: typeof REGIONS[0] }) {
  const intensity = Math.min(Math.abs(item.change) / 1.5, 1);
  const color = item.change >= 0
    ? `rgba(16,185,129,${0.1 + intensity * 0.4})`
    : `rgba(239,68,68,${0.1 + intensity * 0.4})`;
  const border = item.change >= 0
    ? `rgba(16,185,129,${0.15 + intensity * 0.35})`
    : `rgba(239,68,68,${0.15 + intensity * 0.35})`;
  return (
    <div className="rounded-lg p-2.5 flex flex-col justify-between min-h-[60px] cursor-default hover:scale-[1.04] transition-all"
      style={{ background: color, border: `1px solid ${border}` }}>
      <span className="text-xs font-mono text-slate-300 leading-tight">{item.label}</span>
      <span className={`text-sm font-mono font-bold ${item.change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
        {pct(item.change)}
      </span>
    </div>
  );
}

function RegionHeatmap() {
  const groups = ["Americas", "Europe", "Asia/Pacific", "EM"];
  return (
    <div className="grid grid-cols-4 gap-3">
      {groups.map(g => (
        <div key={g}>
          <p className="text-xs font-mono text-slate-600 mb-2 tracking-widest uppercase">{g}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {REGIONS.filter(r => r.region === g).map(r => <RegionTile key={r.id} item={r} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── WS status badge ───────────────────────────────────────────────────────────

function WsStatusBadge({ status }: { status: WsStatus }) {
  const cfg: Record<WsStatus, { label: string; cls: string }> = {
    idle:        { label: "WS IDLE",         cls: "text-slate-500 border-slate-700 bg-slate-800/50" },
    connecting:  { label: "WS CONNECTING…",  cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
    connected:   { label: "WS STREAMING",    cls: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10" },
    reconnecting:{ label: "WS RECONNECTING", cls: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
    error:       { label: "WS ERROR",        cls: "text-red-400 border-red-500/30 bg-red-500/10" },
    failed:      { label: "WS FAILED",       cls: "text-red-500 border-red-600/30 bg-red-600/10" },
  };
  const { label, cls } = cfg[status] ?? cfg["error"];
  return (
    <span className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border ${cls}`}>
      {status === "connected" && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
      {(status === "connecting" || status === "reconnecting") && (
        <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
      )}
      {(status === "error" || status === "failed") && <span>✕</span>}
      {label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketsPage() {
  const { data, error, isLoading, mutate } = useSWR<MarketSnapshot>(
    "/api/market", fetcher, { refreshInterval: 5 * 60 * 1000 }
  );

  // Finnhub WebSocket — real-time price ticks
  const { liveQuotes, status: wsStatus } = useFinnhubWs(Object.values(FH_SYMBOLS));

  const snap = data as MarketSnapshot | undefined;
  const fg   = snap ? fearGreed(snap.sectors) : 50;
  const { label: fgLabelStr, color: fgColor } = fgLabel(fg);

  // Merge WebSocket ticks over REST quotes — WS price takes precedence when present
  const mergedQuotes = useMemo<Record<string, Quote>>(() => {
    if (!snap?.quotes) return {};
    const out = { ...snap.quotes };
    for (const [ourKey, fhSym] of Object.entries(FH_SYMBOLS)) {
      const tick = liveQuotes[fhSym];
      const base = out[ourKey];
      if (!tick || !base) continue;
      const change    = tick.price - base.previousClose;
      const changePct = base.previousClose > 0 ? (change / base.previousClose) * 100 : 0;
      out[ourKey] = { ...base, price: tick.price, change, changePct };
    }
    return out;
  }, [snap?.quotes, liveQuotes]);

  const quoteList: [string, string][] = [
    ["S&P 500", "SPY"], ["NASDAQ", "QQQ"], ["Gold", "GLD"], ["Bitcoin", "BTC"], ["EUR/USD", "EURUSD"],
  ];

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #050b18 0%, #070e1b 50%, #080c1a 100%)" }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-slate-800/60 px-6 py-3 flex items-center justify-between"
        style={{ background: "rgba(5,11,24,0.85)", backdropFilter: "blur(16px)" }}>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span className="text-cyan-400 font-mono">⬡</span> ALPHA SCREEN
            <span className="text-xs font-mono font-normal bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full ml-1 animate-pulse">
              LIVE
            </span>
          </h1>
          <p className="text-xs text-slate-500 font-mono tracking-wider">Global Markets Intelligence</p>
        </div>

        {/* Session badges + WS status */}
        <div className="flex items-center gap-2 flex-wrap">
          <WsStatusBadge status={wsStatus} />
          {snap?.sessions.map((s, i) => <SessionBadge key={i} s={s} />) ?? (
            ["US", "EU", "ASIA", "FX"].map(l => (
              <div key={l} className="h-6 w-20 rounded-full bg-slate-800 animate-pulse" />
            ))
          )}
        </div>

        {/* Fear & Greed */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-slate-500 font-mono tracking-wider">FEAR & GREED</p>
            <p className="text-lg font-mono font-bold" style={{ color: fgColor }}>{fg}</p>
            <p className="text-xs font-mono font-semibold" style={{ color: fgColor }}>{fgLabelStr}</p>
          </div>
          <FearGreedGauge score={fg} />
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* ── Index cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {quoteList.map(([name, sym]) => {
            const q      = mergedQuotes[sym] ?? snap?.quotes?.[sym];
            const fhSym  = FH_SYMBOLS[sym];
            const isLive = wsStatus === "connected" && !!fhSym && !!liveQuotes[fhSym];
            if (!q) return (
              <div key={sym} className="rounded-xl border border-slate-800 p-4 animate-pulse">
                <div className="h-3 bg-slate-800 rounded mb-2 w-12" />
                <div className="h-5 bg-slate-800 rounded mb-3 w-24" />
                <div className="h-10 bg-slate-800 rounded" />
              </div>
            );
            return (
              <div key={sym}>
                <p className="text-xs text-slate-600 font-mono mb-1 tracking-wider">{name}</p>
                <IndexCard q={q} isLive={isLive} />
              </div>
            );
          })}
        </div>

        {/* ── Region heatmap ───────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-800/60 p-5"
          style={{ background: "rgba(7,14,27,0.8)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white font-mono tracking-widest uppercase">Global Equity Heatmap</h2>
            <span className="text-xs text-slate-600 font-mono">24h performance by index</span>
          </div>
          <RegionHeatmap />
        </div>

        {/* ── Three-column main grid ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT — Sector rotation */}
          <div className="rounded-xl border border-slate-800/60 p-5"
            style={{ background: "rgba(7,14,27,0.8)", backdropFilter: "blur(12px)" }}>
            <h2 className="text-sm font-bold text-white font-mono tracking-widest uppercase mb-4">Sector Rotation</h2>
            {snap?.sectors ? (
              <SectorChart sectors={snap.sectors} />
            ) : (
              <div className="h-64 flex items-center justify-center">
                <div className="text-slate-700 font-mono text-xs animate-pulse">Loading sectors...</div>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs font-mono">
              {snap && Object.entries(snap.sectors)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(([s, v]) => (
                  <div key={s} className="flex items-center gap-1 text-emerald-400">
                    <span>▲</span><span className="truncate">{s}</span><span className="ml-auto">{pct(v)}</span>
                  </div>
                ))}
              {snap && Object.entries(snap.sectors)
                .sort((a, b) => a[1] - b[1])
                .slice(0, 2)
                .map(([s, v]) => (
                  <div key={s} className="flex items-center gap-1 text-red-400">
                    <span>▼</span><span className="truncate">{s}</span><span className="ml-auto">{pct(v)}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* CENTER — Movers */}
          <div className="rounded-xl border border-slate-800/60 p-5"
            style={{ background: "rgba(7,14,27,0.8)", backdropFilter: "blur(12px)" }}>
            <h2 className="text-sm font-bold text-white font-mono tracking-widest uppercase mb-4">Market Movers</h2>

            <div className="mb-3">
              <p className="text-xs text-emerald-500 font-mono font-bold tracking-widest mb-2 flex items-center gap-1">
                <span>▲</span> TOP GAINERS
              </p>
              <div className="space-y-1.5">
                {(snap?.gainers ?? Array(5).fill(null)).map((m, i) =>
                  m ? <MoverRow key={i} m={m} dir="up" /> : (
                    <div key={i} className="h-9 bg-slate-800/50 rounded-lg animate-pulse" />
                  )
                )}
              </div>
            </div>

            <div className="border-t border-slate-800 my-4" />

            <div>
              <p className="text-xs text-red-500 font-mono font-bold tracking-widest mb-2 flex items-center gap-1">
                <span>▼</span> TOP LOSERS
              </p>
              <div className="space-y-1.5">
                {(snap?.losers ?? Array(5).fill(null)).map((m, i) =>
                  m ? <MoverRow key={i} m={m} dir="down" /> : (
                    <div key={i} className="h-9 bg-slate-800/50 rounded-lg animate-pulse" />
                  )
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — News sentiment */}
          <div className="rounded-xl border border-slate-800/60 p-5 flex flex-col"
            style={{ background: "rgba(7,14,27,0.8)", backdropFilter: "blur(12px)" }}>
            <h2 className="text-sm font-bold text-white font-mono tracking-widest uppercase mb-2">Sentiment Feed</h2>

            {snap && (() => {
              const bullish = snap.news.filter(n => n.label.includes("Bullish")).length;
              const bearish = snap.news.filter(n => n.label.includes("Bearish")).length;
              const total   = snap.news.length || 1;
              const bPct    = Math.round((bullish / total) * 100);
              const rPct    = Math.round((bearish / total) * 100);
              return (
                <div className="mb-3">
                  <div className="flex text-xs font-mono gap-3 mb-1.5">
                    <span className="text-emerald-400">Bullish {bPct}%</span>
                    <span className="text-slate-600">Neutral {100 - bPct - rPct}%</span>
                    <span className="text-red-400">Bearish {rPct}%</span>
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                    <div className="bg-emerald-500 rounded-full" style={{ width: `${bPct}%` }} />
                    <div className="bg-slate-700 rounded-full flex-1" />
                    <div className="bg-red-500 rounded-full" style={{ width: `${rPct}%` }} />
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto max-h-72 space-y-0 scrollbar-thin">
              {(snap?.news ?? Array(5).fill(null)).map((item, i) =>
                item ? <NewsRow key={i} item={item} /> : (
                  <div key={i} className="py-2.5 border-b border-slate-800">
                    <div className="h-3 bg-slate-800 rounded animate-pulse mb-1" />
                    <div className="h-3 bg-slate-800 rounded animate-pulse w-2/3" />
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* ── Footer bar ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-xs font-mono text-slate-700 pt-2 pb-4 border-t border-slate-800/40">
          <span>
            {snap
              ? `Updated ${new Date(snap.fetchedAt).toLocaleTimeString()} · refreshes every 5 min`
              : isLoading ? "Loading market data..." : error ? "Data unavailable" : ""}
          </span>
          <div className="flex items-center gap-3">
            {!process.env.NEXT_PUBLIC_AV_KEY_SET && (
              <span className="text-amber-700">Demo mode — add ALPHA_VANTAGE_API_KEY to .env.local for live data</span>
            )}
            <span>Powered by Alpha Vantage</span>
            <button onClick={() => mutate()} className="text-slate-600 hover:text-slate-400 transition-colors border border-slate-800 rounded px-2 py-0.5 hover:border-slate-600">
              ↺ Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
