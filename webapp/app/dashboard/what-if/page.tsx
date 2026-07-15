"use client";
import { getJwt } from "@/lib/jwt";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { engine, WhatIfResponse } from "@/lib/engine";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertCircle, ArrowRight, Clock, Loader2,
  TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import { DataGate } from "@/components/data-gate";



// ── Format helpers ────────────────────────────────────────────────────────────
function fmtUsd(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
function pct(v: number, decimals = 2) {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(decimals)}%`;
}

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ target, prefix = "$", duration = 1200 }: { target: number; prefix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * ease);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  const abs = Math.abs(display);
  let str: string;
  if (abs >= 1_000_000) str = `${prefix}${(display / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) str = `${prefix}${(display / 1_000).toFixed(1)}K`;
  else str = `${prefix}${display.toFixed(0)}`;

  return <span>{str}</span>;
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 shadow-2xl backdrop-blur-sm">
      <p className="text-xs text-slate-400 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-6 text-xs">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="text-white font-mono">{fmtUsd(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Preset scenarios ──────────────────────────────────────────────────────────
const PRESETS = [
  { symbol: "NVDA",    amount: 10000, start: "2022-01-01", label: "NVDA",      sub: "Jan 2022" },
  { symbol: "BTC-USD", amount: 10000, start: "2020-01-01", label: "Bitcoin",   sub: "Jan 2020" },
  { symbol: "QQQ",     amount: 10000, start: "2020-01-01", label: "QQQ",       sub: "Jan 2020" },
  { symbol: "AAPL",    amount: 10000, start: "2019-01-01", label: "Apple",     sub: "Jan 2019" },
  { symbol: "TSLA",    amount: 10000, start: "2020-01-01", label: "Tesla",     sub: "Jan 2020" },
  { symbol: "SPY",     amount: 10000, start: "2010-01-01", label: "S&P 500",   sub: "Jan 2010" },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WhatIfPage() {
  const [symbol,    setSymbol]    = useState("NVDA");
  const [amount,    setAmount]    = useState("10000");
  const [startDate, setStartDate] = useState("2022-01-01");
  const [result,    setResult]    = useState<WhatIfResponse | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [revealed,  setRevealed]  = useState(false);

  async function run(sym = symbol, amt = amount, sd = startDate) {
    const amtNum = parseFloat(amt);
    if (!sym || isNaN(amtNum) || amtNum <= 0 || !sd) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setRevealed(false);
    try {
      const jwt  = await getJwt();
      const data = await engine.portfolio.whatIf(jwt, sym.toUpperCase().trim(), amtNum, sd);
      setResult(data);
      // Slight delay for dramatic reveal
      setTimeout(() => setRevealed(true), 120);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function loadPreset(p: typeof PRESETS[0]) {
    setSymbol(p.symbol);
    setAmount(String(p.amount));
    setStartDate(p.start);
    run(p.symbol, String(p.amount), p.start);
  }

  // Chart data — thin to 150 pts
  const chartData = (() => {
    if (!result?.time_series?.length) return [];
    const ts = result.time_series;
    const step = Math.max(1, Math.floor(ts.length / 150));
    return ts
      .filter((_, i) => i % step === 0 || i === ts.length - 1)
      .map(p => ({ date: p.date.slice(0, 7), hyp: p.hypothetical, port: p.portfolio, spy: p.benchmark }));
  })();

  const diff       = result ? result.hypothetical_final - result.amount_invested * (1 + result.actual_return) : 0;
  const diffLabel  = diff >= 0 ? "more" : "less";
  const hypothWins = result?.winner === "hypothetical";
  const portWins   = result?.winner === "portfolio";

  const cards = result ? [
    {
      key:    result.symbol,
      label:  result.symbol,
      ret:    result.hypothetical_return,
      cagr:   result.hypothetical_cagr,
      final:  result.hypothetical_final,
      color:  "#8FF5FF",
      winner: hypothWins,
    },
    {
      key:    "portfolio",
      label:  "Your Portfolio",
      ret:    result.actual_return,
      cagr:   result.actual_cagr,
      final:  result.amount_invested * (1 + result.actual_return),
      color:  "#10B981",
      winner: portWins,
    },
    {
      key:    "spy",
      label:  "SPY Benchmark",
      ret:    result.benchmark_return,
      cagr:   result.benchmark_cagr,
      final:  result.amount_invested * (1 + result.benchmark_return),
      color:  "#F59E0B",
      winner: result.winner === "benchmark",
    },
  ] : [];

  return (
    <DataGate description="Compare what would have happened if you had made a different investment decision at any point in your portfolio history.">
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/15 border border-accent/20 shrink-0">
          <Clock size={18} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">What-if Time Machine</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Replay any investment against your real portfolio from a chosen point in time
          </p>
        </div>
      </div>

      {/* ── Input panel ────────────────────────────────────────────────────── */}
      <div className="bg-[#161b22] border border-white/8 rounded-2xl p-6 space-y-5">

        {/* Quick presets */}
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-widest mb-3">Quick scenarios</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.symbol}
                onClick={() => loadPreset(p)}
                disabled={loading}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  symbol === p.symbol
                    ? "bg-accent/15 border-accent/40 text-accent"
                    : "bg-white/4 border-white/8 text-slate-400 hover:text-white hover:border-white/20"
                }`}
              >
                <span className="font-mono font-bold">{p.label}</span>
                <span className="text-slate-500">{p.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-white/5" />

        {/* Custom input */}
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-widest mb-3">Custom scenario</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Ticker symbol</label>
              <input
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && run()}
                placeholder="e.g. NVDA"
                className="w-full bg-white/4 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent/40 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Amount (USD)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min={1}
                placeholder="10000"
                className="w-full bg-white/4 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Start date</label>
              <input
                type="date"
                value={startDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-white/4 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/40 transition-colors"
              />
            </div>
          </div>
        </div>

        <button
          onClick={() => run()}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-accent/20"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
          {loading ? "Running simulation…" : "Run Time Machine"}
          {!loading && <ArrowRight size={14} className="ml-1" />}
        </button>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────────────── */}
      {loading && (
        <div className="bg-[#161b22] border border-white/8 rounded-2xl p-8 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-accent/20 animate-spin border-t-accent" />
            <Clock size={20} className="absolute inset-0 m-auto text-accent" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">Rewinding time…</p>
            <p className="text-slate-500 text-sm mt-1">
              Fetching historical prices and replaying your portfolio
            </p>
          </div>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {result && revealed && (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

          {/* ── Headline: the number that matters ─────────────────────────── */}
          <div className={`relative overflow-hidden rounded-2xl border p-6 ${
            diff >= 0
              ? "bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20"
              : "bg-gradient-to-br from-rose-500/10 to-transparent border-rose-500/20"
          }`}>
            {/* Background glow */}
            <div className={`absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-20 ${diff >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} />

            <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-xs text-slate-400 uppercase tracking-widest font-medium mb-1">
                  {hypothWins ? `${result.symbol} beat your portfolio by` : portWins ? "Your portfolio beat the alternatives by" : "SPY beat your portfolio by"}
                </p>
                <div className={`text-4xl sm:text-5xl font-black font-mono tabular-nums ${diff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  <AnimatedNumber target={Math.abs(diff)} duration={1400} />
                </div>
                <p className="text-slate-400 text-sm mt-2">
                  {fmtUsd(parseFloat(amount))} invested from {result.start_date} → {result.end_date}
                </p>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-1">
                <div className={`flex items-center gap-1.5 text-sm font-medium ${diff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {diff >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {fmtUsd(Math.abs(diff))} {diffLabel}
                </div>
                <p className="text-xs text-slate-500">vs your actual outcome</p>
              </div>
            </div>
          </div>

          {/* ── Three-way comparison cards ─────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cards.map(card => (
              <div
                key={card.key}
                className={`relative rounded-2xl border p-5 transition-all ${
                  card.winner
                    ? "border-transparent ring-1"
                    : "border-white/8 bg-[#161b22]"
                }`}
                style={card.winner ? {
                  background: `linear-gradient(135deg, ${card.color}18, #161b22)`,
                  boxShadow:  `0 0 0 1px ${card.color}44`,
                } : {}}
              >
                {card.winner && (
                  <span
                    className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: card.color + "22", color: card.color }}
                  >
                    WINNER
                  </span>
                )}
                <p className="text-xs text-slate-500 mb-3 font-mono font-bold" style={{ color: card.color }}>
                  {card.label}
                </p>
                <p className={`text-2xl font-black font-mono ${card.ret >= 0 ? "text-white" : "text-rose-400"}`}>
                  {pct(card.ret)}
                </p>
                <p className="text-slate-300 text-sm font-medium mt-1">{fmtUsd(card.final)}</p>
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-xs text-slate-500">CAGR</p>
                  <p className="text-sm font-mono font-semibold text-white">{pct(card.cagr)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Growth chart ───────────────────────────────────────────────── */}
          <div className="bg-[#161b22] border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-3">
              <p className="text-sm font-semibold text-white">
                Growth of {fmtUsd(parseFloat(amount))}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {result.start_date} → {result.end_date} · {chartData.length} data points
              </p>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 px-6 pb-4">
              {[
                { key: "hyp",  label: result.symbol,       color: "#8FF5FF" },
                { key: "port", label: "Your Portfolio",    color: "#10B981" },
                { key: "spy",  label: "SPY",               color: "#F59E0B" },
              ].map(l => (
                <div key={l.key} className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: l.color }} />
                  <span className="text-xs text-slate-400">{l.label}</span>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                <defs>
                  {[
                    { id: "hyp",  color: "#8FF5FF" },
                    { id: "port", color: "#10B981" },
                    { id: "spy",  color: "#F59E0B" },
                  ].map(g => (
                    <linearGradient key={g.id} id={`g${g.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={g.color} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={g.color} stopOpacity={0}    />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#4b5563", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={60}
                />
                <YAxis
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: "#4b5563", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={parseFloat(amount)} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <Area dataKey="hyp"  type="monotone" stroke="#8FF5FF" fill="url(#ghyp)"  strokeWidth={2.5} dot={false} name={result.symbol} />
                <Area dataKey="port" type="monotone" stroke="#10B981" fill="url(#gport)" strokeWidth={2}   dot={false} name="Your Portfolio" />
                <Area dataKey="spy"  type="monotone" stroke="#F59E0B" fill="url(#gspy)"  strokeWidth={1.5} dot={false} name="SPY" strokeDasharray="5 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Insight strip ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Hypothetical final",  value: fmtUsd(result.hypothetical_final),                               color: "#8FF5FF" },
              { label: "Your portfolio final", value: fmtUsd(result.amount_invested * (1 + result.actual_return)),    color: "#10B981" },
              { label: "SPY final",           value: fmtUsd(result.amount_invested * (1 + result.benchmark_return)), color: "#F59E0B" },
              { label: "Opportunity cost",    value: fmtUsd(Math.abs(diff)),                                         color: diff >= 0 ? "#FF716C" : "#10B981" },
            ].map(s => (
              <div key={s.label} className="bg-[#161b22] border border-white/8 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-1.5">{s.label}</p>
                <p className="text-base font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </DataGate>
  );
}
