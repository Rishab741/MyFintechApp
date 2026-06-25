"use client";

import useSWR from "swr";
import { useState } from "react";
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
  Area, AreaChart, CartesianGrid, XAxis, YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { engine } from "@/lib/engine";
import MetricCard from "@/components/ui/metric-card";
import {
  Activity, BarChart2, Briefcase, Minus, Percent,
  TrendingUp, Target,
} from "lucide-react";

async function getJwt() {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? "";
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PERIODS   = ["1M", "3M", "6M", "1Y", "3Y", "ALL"] as const;
const HIST_PERI = ["1M", "3M", "6M", "1Y"] as const;
type Period = typeof PERIODS[number];

const SLICE_COLORS = [
  "#8FF5FF", "#AC89FF", "#F59E0B", "#10B981",
  "#F97316", "#6366F1", "#EC4899", "#14B8A6",
];

function pct(v: number | null | undefined, decimals = 2): string | null {
  if (v == null) return null;
  return `${(v * 100).toFixed(decimals)}%`;
}

function fmtMoney(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

// ── Custom tooltip for pie ────────────────────────────────────────────────────
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0E1D35] border border-[rgba(14,165,233,0.15)] rounded-lg px-3 py-2">
      <p className="text-white text-xs font-medium">{d.asset_class ?? d.sector ?? d.name}</p>
      <p className="text-slate-400 text-xs">{fmtMoney(d.market_value)} · {d.allocation_pct.toFixed(1)}%</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const [period,     setPeriod]     = useState<Period>("1Y");
  const [histPeriod, setHistPeriod] = useState<string>("3M");

  // Metrics
  const { data, isLoading } = useSWR(["metrics", period], async () => {
    const jwt = await getJwt();
    return engine.portfolio.metrics(jwt, period);
  });

  // Exposure
  const { data: expo } = useSWR("exposure", async () => {
    const jwt = await getJwt();
    return engine.portfolio.exposure(jwt);
  });

  // NAV history
  const { data: hist } = useSWR(["history", histPeriod], async () => {
    const jwt = await getJwt();
    return engine.portfolio.history(jwt, histPeriod);
  });

  const twr   = data?.twr   != null ? (data.twr   >= 0 ? "positive" : "negative") as const : "neutral" as const;
  const cagr  = data?.cagr  != null ? (data.cagr  >= 0 ? "positive" : "negative") as const : "neutral" as const;
  const alpha = data?.alpha != null ? (data.alpha >= 0 ? "positive" : "negative") as const : "neutral" as const;

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Analytics</h1>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === p ? "bg-accent text-white" : "text-muted hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Returns ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">Returns</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard label="Time-Weighted Return" value={pct(data?.twr)}   icon={TrendingUp} trend={twr}   loading={isLoading} />
          <MetricCard label="CAGR"                 value={pct(data?.cagr)}  icon={Percent}    trend={cagr}  loading={isLoading} />
          <MetricCard label="Alpha vs SPY"          value={pct(data?.alpha)} icon={Target}     trend={alpha} loading={isLoading} sub="Benchmark: SPY" />
        </div>
      </section>

      {/* ── Risk ────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">Risk</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Sharpe"      value={data?.sharpe?.toFixed(2)   ?? null} icon={Activity} trend={data?.sharpe != null && data.sharpe >= 1 ? "positive" : "neutral"} loading={isLoading} sub="Higher is better" />
          <MetricCard label="Sortino"     value={data?.sortino?.toFixed(2)  ?? null} icon={Activity} loading={isLoading} />
          <MetricCard label="Max Drawdown" value={pct(data?.max_drawdown)}            icon={Minus}   trend="negative" loading={isLoading} sub="Peak-to-trough" />
          <MetricCard label="Volatility"  value={pct(data?.volatility)}               icon={BarChart2} loading={isLoading} sub="Annualised" />
        </div>
      </section>

      {/* ── Market exposure ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">Market Exposure</h2>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Beta" value={data?.beta?.toFixed(3) ?? null} icon={BarChart2} loading={isLoading} sub="vs SPY" />
        </div>
      </section>

      {/* ── NAV History chart ────────────────────────────────────────────── */}
      <section>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-accent" />
              <p className="text-sm font-medium text-white">Portfolio NAV</p>
            </div>
            <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
              {HIST_PERI.map(p => (
                <button
                  key={p}
                  onClick={() => setHistPeriod(p)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    histPeriod === p ? "bg-accent text-white" : "text-muted hover:text-white"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="p-5">
            {hist?.nav_series && hist.nav_series.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={hist.nav_series.map(p => ({
                    time:  p.time.slice(0, 10),
                    value: p.total_value,
                    bench: p.benchmark_value,
                  }))}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#0EA5E9" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fill: "#607A93", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={50} />
                  <YAxis tickFormatter={fmtMoney} tick={{ fill: "#607A93", fontSize: 10 }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip
                    contentStyle={{ background: "#0E1D35", border: "1px solid rgba(14,165,233,0.15)", borderRadius: 8 }}
                    labelStyle={{ color: "#607A93", fontSize: 11 }}
                    formatter={(v: number, name: string) => [fmtMoney(v), name === "value" ? "Portfolio" : "Benchmark"]}
                  />
                  <Area dataKey="value" stroke="#0EA5E9" fill="url(#navGrad)" strokeWidth={2} dot={false} type="monotone" name="value" />
                  {hist.nav_series.some(p => p.benchmark_value) && (
                    <Area dataKey="bench" stroke="#AC89FF" fill="none" strokeWidth={1.5} strokeDasharray="4 2" dot={false} type="monotone" name="bench" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted text-sm">
                No NAV history for this period
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Exposure breakdown ───────────────────────────────────────────── */}
      {expo && (
        <section>
          <h2 className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">Exposure</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Asset class donut */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs text-muted font-medium uppercase tracking-wide mb-4 flex items-center gap-2">
                <Briefcase size={12} /> By Asset Class
              </p>
              {expo.by_asset_class.length ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={expo.by_asset_class}
                        dataKey="market_value"
                        nameKey="asset_class"
                        cx="50%" cy="50%"
                        innerRadius={38} outerRadius={60}
                        strokeWidth={0}
                      >
                        {expo.by_asset_class.map((_, i) => (
                          <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {expo.by_asset_class.slice(0, 6).map((ac, i) => (
                      <div key={ac.asset_class} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                        <span className="text-xs text-muted capitalize flex-1 truncate">{ac.asset_class}</span>
                        <span className="text-xs font-mono text-white">{ac.allocation_pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-muted text-sm">No exposure data</p>
              )}
            </div>

            {/* Sector donut */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs text-muted font-medium uppercase tracking-wide mb-4 flex items-center gap-2">
                <BarChart2 size={12} /> By Sector
              </p>
              {expo.by_sector.length ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={expo.by_sector}
                        dataKey="market_value"
                        nameKey="sector"
                        cx="50%" cy="50%"
                        innerRadius={38} outerRadius={60}
                        strokeWidth={0}
                      >
                        {expo.by_sector.map((_, i) => (
                          <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {expo.by_sector.slice(0, 6).map((sec, i) => (
                      <div key={sec.sector} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                        <span className="text-xs text-muted flex-1 truncate">{sec.sector}</span>
                        <span className="text-xs font-mono text-white">{sec.allocation_pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-muted text-sm">No sector data</p>
              )}
            </div>
          </div>

          {/* Concentration stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            {([
              ["Top-3 Weight",     expo.concentration.top_3_pct.toFixed(1) + "%"],
              ["Top-10 Weight",    expo.concentration.top_10_pct.toFixed(1) + "%"],
              ["Herfindahl Index", expo.concentration.herfindahl_index.toFixed(4)],
              ["Effective N",      expo.concentration.effective_n.toFixed(1)],
            ] as [string, string][]).map(([lbl, val]) => (
              <div key={lbl} className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-lg font-bold text-white font-mono">{val}</p>
                <p className="text-xs text-muted mt-1">{lbl}</p>
              </div>
            ))}
          </div>

          {/* Largest position */}
          {expo.concentration.largest_position && (
            <div className="bg-card border border-amber-500/20 rounded-xl px-5 py-4 flex items-center gap-4 mt-4">
              <div>
                <p className="text-xs text-muted mb-0.5">Largest position</p>
                <p className="text-white font-bold font-mono">{expo.concentration.largest_position.symbol}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-amber-400 font-bold font-mono text-lg">
                  {expo.concentration.largest_position.allocation_pct.toFixed(1)}%
                </p>
                <p className="text-xs text-muted">{fmtMoney(expo.concentration.largest_position.market_value)}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {data?.computed_at && (
        <p className="text-xs text-muted text-right">Computed {new Date(data.computed_at).toLocaleString()}</p>
      )}
    </div>
  );
}
