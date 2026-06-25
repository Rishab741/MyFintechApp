"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, AlertCircle, BarChart2, ChevronDown, ChevronRight,
  GitBranch, Loader2, Play, Plus, Sigma, Sparkles, Trophy, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { engine, SimJobResult, SimAssetMetrics } from "@/lib/engine";
import ComparisonChart  from "@/components/charts/comparison-chart";
import MonteCarloChart  from "@/components/charts/monte-carlo-chart";

// ── Constants ──────────────────────────────────────────────────────────────────
const PALETTE = ["#8FF5FF", "#AC89FF", "#F59E0B", "#10B981", "#F97316", "#6366F1"];
const PERIODS  = [
  { label: "6M",  months: 6   },
  { label: "1Y",  months: 12  },
  { label: "2Y",  months: 24  },
  { label: "3Y",  months: 36  },
  { label: "5Y",  months: 60  },
  { label: "Max", months: 0   },
];
const REBAL_OPTS: { value: string; label: string }[] = [
  { value: "hold",             label: "Buy & Hold"           },
  { value: "monthly",          label: "Monthly Rebalance"    },
  { value: "quarterly",        label: "Quarterly Rebalance"  },
  { value: "threshold_10pct",  label: "±10% Threshold"       },
  { value: "threshold_20pct",  label: "±20% Threshold"       },
];
const FEATURED = ["SPY", "QQQ", "BTC-USD", "NVDA", "AAPL", "MSFT", "GLD"];

const LOADING_PHASES = [
  "Fetching historical price data…",
  "Replaying your actual trade history…",
  "Computing behavioral bias scores…",
  "Running risk-adjusted metrics…",
  "Firing up 1,000 Monte Carlo paths…",
  "Scoring decision impact at each node…",
  "Calculating Temporal Opportunity Index…",
  "Finalising results…",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(v: number, d = 2) { return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`; }
function fmtMoney(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
function offsetDate(months: number) {
  if (months === 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// ── MetricCell ────────────────────────────────────────────────────────────────
function MetricCell({ v, format = "pct", best }: {
  v:      number | undefined;
  format?: "pct" | "raw" | "money";
  best?:  number;
}) {
  const isBest  = v !== undefined && v === best;
  const display = v === undefined ? "—" :
    format === "pct"   ? pct(v) :
    format === "money" ? fmtMoney(v) :
    v.toFixed(2);
  return (
    <td className={`px-3 py-2.5 text-right text-sm font-mono ${isBest ? "text-white font-bold" : "text-slate-300"}`}>
      {display}
      {isBest && <span className="ml-1 text-[10px] text-green-400">▲</span>}
    </td>
  );
}

// ── Animated cycling phase label ──────────────────────────────────────────────
function PhaseCycler({ running }: { running: boolean }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setIdx(i => (i + 1) % LOADING_PHASES.length), 3000);
    return () => clearInterval(id);
  }, [running]);
  return (
    <p key={idx} className="text-sm text-slate-400 animate-in fade-in duration-500">
      {LOADING_PHASES[idx]}
    </p>
  );
}

// ── Monte Carlo narrative ─────────────────────────────────────────────────────
function MCNarrative({ label, p10, p50, p90, initial, color }: {
  label:   string;
  p10:     number;
  p50:     number;
  p90:     number;
  initial: number;
  color:   string;
}) {
  const odds = p10 > initial ? 90 : p50 > initial ? 50 : 25;
  return (
    <div className="space-y-2 text-sm text-slate-400">
      <p>
        <span style={{ color }} className="font-semibold">{label}</span>
        {" "}has a <span className="text-white font-semibold">{odds}%+</span> chance
        of ending above your starting value.
      </p>
      <p>
        In the median scenario you reach{" "}
        <span className="text-white font-semibold">{fmtMoney(p50)}</span>.
        A strong bull market could push this to{" "}
        <span className="text-green-400 font-semibold">{fmtMoney(p90)}</span>,
        while a sustained downturn floors you at{" "}
        <span className="text-red-400 font-semibold">{fmtMoney(p10)}</span>.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SimulatePage() {
  // ── Form state ────────────────────────────────────────────────────────────
  const [assets,           setAssets]          = useState<string[]>(["SPY"]);
  const [assetInput,       setAssetInput]      = useState("");
  const [months,           setMonths]          = useState(24);
  const [rebalancing,      setRebalancing]     = useState("hold");
  const [runMC,            setRunMC]           = useState(false);
  const [applyBehavioral,  setApplyBehavioral] = useState(true);
  const [savings,          setSavings]         = useState("1000");

  // ── Job state ─────────────────────────────────────────────────────────────
  type Phase = "idle" | "starting" | "running" | "complete" | "failed";
  const [phase,    setPhase]   = useState<Phase>("idle");
  const [elapsed,  setElapsed] = useState(0);
  const [result,   setResult]  = useState<SimJobResult | null>(null);
  const [errorMsg, setError]   = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);

  useEffect(() => () => {
    if (pollRef.current)  clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ── Asset management ──────────────────────────────────────────────────────
  const addAsset = (sym: string) => {
    const clean = sym.trim().toUpperCase();
    if (!clean || assets.includes(clean) || assets.length >= 5) return;
    setAssets(prev => [...prev, clean]);
    setAssetInput("");
  };
  const removeAsset = (sym: string) => setAssets(prev => prev.filter(a => a !== sym));

  // ── Run simulation ────────────────────────────────────────────────────────
  async function handleRun() {
    if (!assets.length) return;
    if (pollRef.current)  clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    setPhase("starting");
    setResult(null);
    setError(null);
    setElapsed(0);
    setRevealed(false);
    startedAt.current = Date.now();

    try {
      const supabase = createClient();
      const { data: { user } }    = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      const jwt    = session?.access_token ?? "";
      const userId = user?.id ?? "";
      const runId  = crypto.randomUUID();

      const { job_id } = await engine.simulate.run(jwt, {
        user_id:                     userId,
        run_id:                      runId,
        comparison_assets:           assets,
        period_start:                offsetDate(months),
        period_end:                  new Date().toISOString().slice(0, 10),
        rebalancing_strategy:        rebalancing,
        apply_behavioral_adjustment: applyBehavioral,
        apply_dividend_reinvestment: true,
        run_monte_carlo:             runMC,
        monthly_savings_assumption:  Number(savings) || 1000,
      });

      setPhase("running");

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 1000);

      pollRef.current = setInterval(async () => {
        try {
          const status = await engine.simulate.poll(jwt, job_id);
          if (status.status === "complete") {
            clearInterval(pollRef.current!);
            clearInterval(timerRef.current!);
            setResult(status);
            setPhase("complete");
            setTimeout(() => setRevealed(true), 100);
          } else if (status.status === "failed") {
            clearInterval(pollRef.current!);
            clearInterval(timerRef.current!);
            setError(status.error ?? "Simulation failed");
            setPhase("failed");
          }
        } catch { /* transient */ }
      }, 2000);

    } catch (e: any) {
      clearInterval(timerRef.current!);
      setError(e.message ?? "Failed to start");
      setPhase("failed");
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const metricKeys = result?.metrics ? Object.keys(result.metrics) : [];

  function bestOf(key: keyof SimAssetMetrics, lowerBetter = false) {
    if (!result?.metrics) return undefined;
    const vals = metricKeys
      .map(k => result.metrics![k]?.[key] as number | undefined)
      .filter((v): v is number => v !== undefined);
    if (!vals.length) return undefined;
    return lowerBetter ? Math.min(...vals) : Math.max(...vals);
  }

  // Overall winner: highest total_return
  const winner = (() => {
    if (!result?.metrics) return null;
    let best: { key: string; ret: number } | null = null;
    for (const k of metricKeys) {
      const r = result.metrics![k]?.total_return ?? -Infinity;
      if (!best || r > best.ret) best = { key: k, ret: r };
    }
    return best;
  })();

  const [showAllNodes, setShowAllNodes] = useState(false);
  const nodes        = result?.inflection_points ?? [];
  const visibleNodes = showAllNodes ? nodes : nodes.slice(0, 3);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/15 border border-accent/20 shrink-0">
          <Sigma size={18} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">Counterfactual Simulation</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Replay your actual trade history against any asset — with behavioral adjustment, Monte Carlo, and decision impact scoring
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6 items-start">

        {/* ── Configuration panel ─────────────────────────────────────── */}
        <div className="bg-[#161b22] border border-white/8 rounded-2xl p-5 space-y-5 sticky top-4">

          {/* Asset picker */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest font-medium mb-2">
              Compare against (up to 5)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                value={assetInput}
                onChange={e => setAssetInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && addAsset(assetInput)}
                placeholder="e.g. NVDA, BTC-USD"
                className="flex-1 bg-white/4 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent/40 transition-colors"
              />
              <button
                onClick={() => addAsset(assetInput)}
                disabled={assets.length >= 5}
                className="px-3 py-2 bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent rounded-xl transition-colors disabled:opacity-40"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {FEATURED.map(sym => (
                <button
                  key={sym}
                  onClick={() => addAsset(sym)}
                  disabled={assets.includes(sym) || assets.length >= 5}
                  className="text-xs px-2 py-1 rounded-full border border-white/10 text-slate-500 hover:text-white hover:border-accent/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {sym}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {assets.map((sym, i) => (
                <span
                  key={sym}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border"
                  style={{ color: PALETTE[i], borderColor: PALETTE[i] + "44", background: PALETTE[i] + "11" }}
                >
                  {sym}
                  <button onClick={() => removeAsset(sym)} className="opacity-60 hover:opacity-100">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {assets.length === 0 && <p className="text-xs text-slate-500 italic">No assets selected</p>}
            </div>
          </div>

          {/* Period */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest font-medium mb-2">Lookback period</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PERIODS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setMonths(p.months)}
                  className={`py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    months === p.months
                      ? "bg-accent/20 border-accent text-accent"
                      : "bg-white/4 border-white/8 text-slate-500 hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rebalancing */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest font-medium mb-2">Rebalancing strategy</label>
            <div className="relative">
              <select
                value={rebalancing}
                onChange={e => setRebalancing(e.target.value)}
                className="w-full appearance-none bg-white/4 border border-white/8 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/40 pr-8"
              >
                {REBAL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* Monthly savings */}
          <div>
            <label className="block text-xs text-slate-500 uppercase tracking-widest font-medium mb-2">
              Monthly savings assumption (USD)
            </label>
            <input
              type="number"
              value={savings}
              onChange={e => setSavings(e.target.value)}
              min={0}
              placeholder="1000"
              className="w-full bg-white/4 border border-white/8 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/40 transition-colors"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            {([
              ["Behavioral Adjustment (BACS)",         applyBehavioral, setApplyBehavioral],
              ["Monte Carlo Simulation (1,000 paths)", runMC,           setRunMC          ],
            ] as [string, boolean, React.Dispatch<React.SetStateAction<boolean>>][]).map(([lbl, val, setter]) => (
              <label key={lbl} className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => setter(!val)}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${val ? "bg-accent" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${val ? "translate-x-4" : ""}`} />
                </div>
                <span className="text-sm text-slate-400 group-hover:text-white transition-colors">{lbl}</span>
              </label>
            ))}
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={!assets.length || phase === "starting" || phase === "running"}
            className="flex items-center justify-center gap-2 w-full py-3 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-accent/20"
          >
            {(phase === "starting" || phase === "running") ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {phase === "starting" ? "Starting…" : `Running · ${elapsed}s`}
              </>
            ) : (
              <>
                <Play size={16} />
                Run Simulation
              </>
            )}
          </button>
        </div>

        {/* ── Results panel ───────────────────────────────────────────── */}
        <div className="space-y-5 min-h-[400px]">

          {/* Idle state */}
          {phase === "idle" && (
            <div className="bg-[#161b22] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center py-20 text-center px-8 gap-5">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20">
                <Sigma size={28} className="text-accent" />
              </div>
              <div>
                <p className="text-white font-medium">Your simulation canvas is ready</p>
                <p className="text-slate-500 text-sm mt-2 max-w-xs">
                  The engine replays your actual cash flows into each comparison asset, factors in behavioral biases,
                  and computes risk-adjusted metrics side by side.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-2">
                {[
                  ["Behavioral", "BACS scoring"],
                  ["Counterfactual", "Cash flow replay"],
                  ["Monte Carlo", "1,000 futures"],
                ].map(([title, sub]) => (
                  <div key={title} className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
                    <p className="text-xs text-white font-medium">{title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Running */}
          {(phase === "starting" || phase === "running") && (
            <div className="bg-[#161b22] border border-white/8 rounded-2xl flex flex-col items-center justify-center py-16 gap-6">
              {/* Animated pulse rings */}
              <div className="relative flex items-center justify-center">
                <div className="absolute w-20 h-20 rounded-full border border-accent/20 animate-ping" />
                <div className="absolute w-14 h-14 rounded-full border border-accent/30 animate-ping" style={{ animationDelay: "0.3s" }} />
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-accent/15 border border-accent/30">
                  <Sigma size={20} className="text-accent" />
                </div>
              </div>

              <div className="text-center space-y-2">
                <p className="text-white font-semibold">{elapsed}s elapsed</p>
                <PhaseCycler running={phase === "running"} />
              </div>

              {/* Progress bar (indeterminate) */}
              <div className="w-48 h-1 bg-white/8 rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full animate-[shimmer_2s_ease-in-out_infinite]"
                  style={{ width: "60%", animation: "ping 1.5s ease-in-out infinite" }} />
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {assets.map((sym, i) => (
                  <span key={sym}
                    className="text-xs px-2.5 py-1 rounded-full font-mono font-bold border"
                    style={{ color: PALETTE[i], borderColor: PALETTE[i] + "44", background: PALETTE[i] + "11" }}>
                    {sym}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {phase === "failed" && errorMsg && (
            <div className="bg-red-500/8 border border-red-500/20 rounded-2xl px-5 py-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium text-sm">Simulation failed</p>
                <p className="text-slate-400 text-xs mt-1">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* ── Results ──────────────────────────────────────────────── */}
          {phase === "complete" && result && result.timeseries && revealed && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* Winner callout */}
              {winner && (
                <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-r from-accent/10 via-transparent to-transparent p-5">
                  <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-accent/10 blur-2xl" />
                  <div className="relative flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/15 border border-accent/20 shrink-0">
                      <Trophy size={18} className="text-accent" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">Top performer</p>
                      <p className="text-white font-bold mt-0.5">
                        {winner.key === "actual" ? "Your Portfolio" : winner.key.replace(/_/g, " ")}
                        {" "}
                        <span
                          className="font-mono"
                          style={{ color: PALETTE[metricKeys.indexOf(winner.key)] ?? "#8FF5FF" }}
                        >
                          {pct(winner.ret)}
                        </span>
                        {" "}total return
                      </p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-slate-500 font-mono bg-white/5 border border-white/8 rounded-full px-3 py-1">
                        {result.computation_ms}ms
                      </span>
                      <span className="text-xs text-slate-500 font-mono bg-white/5 border border-white/8 rounded-full px-3 py-1">
                        Quality {((result.data_quality_score ?? 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Growth chart ────────────────────────────────────── */}
              <div className="bg-[#161b22] border border-white/8 rounded-2xl p-5">
                <p className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-4">
                  Indexed growth (base = 100 at start)
                </p>
                <ComparisonChart timeseries={result.timeseries} />
              </div>

              {/* ── Metrics table ────────────────────────────────────── */}
              {result.metrics && metricKeys.length > 0 && (
                <div className="bg-[#161b22] border border-white/8 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/6 flex items-center gap-2">
                    <BarChart2 size={14} className="text-accent" />
                    <p className="text-sm font-semibold text-white">Risk-Adjusted Metrics</p>
                    <p className="text-xs text-slate-500 ml-auto">▲ marks best in class</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/6">
                          <th className="px-4 py-2.5 text-left text-xs text-slate-500 font-medium">Metric</th>
                          {metricKeys.map((k, i) => (
                            <th key={k} className="px-3 py-2.5 text-right text-xs font-mono font-bold"
                              style={{ color: PALETTE[i] ?? "#607A93" }}>
                              {k === "actual" ? "Portfolio" : k.split("_")[0]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/4">
                        {([
                          ["Total Return",  "total_return",  "pct",   false],
                          ["CAGR",          "cagr",          "pct",   false],
                          ["Sharpe",        "sharpe",        "raw",   false],
                          ["Sortino",       "sortino",       "raw",   false],
                          ["Volatility",    "volatility",    "pct",   true ],
                          ["Max Drawdown",  "max_drawdown",  "pct",   true ],
                          ["VaR 95%",       "var_95",        "pct",   true ],
                          ["Win Rate",      "win_rate",      "pct",   false],
                          ["End Value",     "end_value",     "money", false],
                        ] as [string, keyof SimAssetMetrics, "pct" | "raw" | "money", boolean][]).map(
                          ([lbl, key, fmt, lowerBetter]) => {
                            const best = bestOf(key, lowerBetter);
                            return (
                              <tr key={key} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{lbl}</td>
                                {metricKeys.map(mk => (
                                  <MetricCell
                                    key={mk}
                                    v={result.metrics![mk]?.[key] as number | undefined}
                                    format={fmt}
                                    best={best}
                                  />
                                ))}
                              </tr>
                            );
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Temporal Opportunity Index ────────────────────────── */}
              {result.temporal_opportunity && (
                <div className="bg-purple-500/5 border border-purple-500/15 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-purple-400" />
                    <p className="text-sm font-semibold text-purple-300">Temporal Opportunity Index</p>
                    {result.temporal_opportunity.best_alternative && (
                      <span className="ml-auto text-xs font-mono px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">
                        Best alt: {result.temporal_opportunity.best_alternative}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-white font-mono">
                        {fmtMoney(result.temporal_opportunity.best_dollar_gap)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Best dollar gap</p>
                    </div>
                    {Object.entries(result.temporal_opportunity.alternatives).slice(0, 3).map(([sym, alt]) => (
                      <div key={sym} className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                        <p className="text-xs text-slate-500 mb-1 font-mono">{sym}</p>
                        <p className={`text-lg font-bold font-mono ${alt.outperformed ? "text-red-400" : "text-green-400"}`}>
                          {alt.months_to_recover > 0 ? `${alt.months_to_recover}mo` : "Ahead"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">to recover</p>
                        <p className="text-xs font-mono mt-1" style={{ color: alt.outperformed ? "#FF716C" : "#10B981" }}>
                          {alt.pct_gap >= 0 ? "+" : ""}{(alt.pct_gap * 100).toFixed(1)}% gap
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Decision Impact Tree ──────────────────────────────── */}
              {nodes.length > 0 && (
                <div className="bg-[#161b22] border border-white/8 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/6 flex items-center gap-2">
                    <GitBranch size={14} className="text-accent" />
                    <p className="text-sm font-semibold text-white">Decision Impact Tree</p>
                    <span className="ml-auto text-xs text-slate-500">{nodes.length} trade nodes analysed</span>
                  </div>
                  <div className="divide-y divide-white/4">
                    {visibleNodes.map((node, i) => {
                      const isBuy  = node.transaction_type === "buy";
                      const impact = node.impact_score ?? 0;
                      return (
                        <div key={i} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-3 mb-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-bold ${
                              isBuy ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                            }`}>
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                            <span className="font-mono font-bold text-white text-sm">{node.symbol}</span>
                            <span className="text-xs text-slate-500">{node.date?.slice(0, 10)}</span>
                            {/* Impact bar */}
                            <div className="ml-auto flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-white/8 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-400 rounded-full"
                                  style={{ width: `${Math.min(impact * 10, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono text-amber-400">{impact.toFixed(1)}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <div className="text-center min-w-[68px]">
                              <p className="text-[10px] text-slate-500 mb-0.5">Actual 30d</p>
                              <p className={`text-sm font-bold font-mono ${node.actual_delta_30d >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {pct(node.actual_delta_30d)}
                              </p>
                            </div>
                            {Object.entries(node.alt_deltas_30d).slice(0, 5).map(([sym, delta]) => (
                              <div key={sym} className="text-center min-w-[68px]">
                                <p className="text-[10px] text-slate-500 mb-0.5 font-mono">{sym}</p>
                                <p className={`text-sm font-bold font-mono ${delta >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {pct(delta)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {nodes.length > 3 && (
                    <button
                      onClick={() => setShowAllNodes(!showAllNodes)}
                      className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-slate-500 hover:text-white transition-colors border-t border-white/6"
                    >
                      {showAllNodes ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {showAllNodes ? "Show fewer" : `Show all ${nodes.length} nodes`}
                    </button>
                  )}
                </div>
              )}

              {/* ── Monte Carlo Fan Charts ────────────────────────────── */}
              {result.monte_carlo && Object.keys(result.monte_carlo).length > 0 && (
                <div className="rounded-2xl overflow-hidden border border-amber-500/15 bg-amber-500/3">
                  <div className="px-5 py-4 border-b border-amber-500/12 flex items-center gap-2">
                    <Activity size={14} className="text-amber-400" />
                    <p className="text-sm font-semibold text-amber-300">Monte Carlo Projection · 1,000 Paths</p>
                    <span className="ml-auto text-xs text-amber-500/60 font-mono">p10 / p25–p75 / p90</span>
                  </div>

                  <div className="divide-y divide-amber-500/8">
                    {Object.entries(result.monte_carlo).map(([key, fan], si) => {
                      const colorIdx = metricKeys.indexOf(key);
                      const color    = PALETTE[colorIdx >= 0 ? colorIdx : si] ?? "#F59E0B";
                      const label    = key === "actual" ? "Your Portfolio" : key.replace(/_/g, " ");
                      const endP10   = fan.p10[fan.p10.length - 1];
                      const endP50   = fan.p50[fan.p50.length - 1];
                      const endP90   = fan.p90[fan.p90.length - 1];
                      const initial  = result.metrics?.[key]?.start_value ?? 0;
                      return (
                        <div key={key} className="p-5 space-y-5">

                          {/* Asset header */}
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ background: color }} />
                            <p className="text-sm font-mono font-bold" style={{ color }}>{label}</p>
                          </div>

                          {/* Narrative */}
                          <MCNarrative
                            label={label}
                            p10={endP10 ?? 0}
                            p50={endP50 ?? 0}
                            p90={endP90 ?? 0}
                            initial={initial}
                            color={color}
                          />

                          {/* Fan chart */}
                          <MonteCarloChart fan={fan} color={color} height={240} />

                          {/* P10 / P50 / P90 cards */}
                          <div className="grid grid-cols-3 gap-3">
                            {([
                              ["Bear case (P10)",    endP10 ?? 0, "#FF716C", "10% of paths end here or lower"],
                              ["Median (P50)",       endP50 ?? 0, color,     "Most likely outcome"],
                              ["Bull case (P90)",    endP90 ?? 0, "#10B981", "10% of paths exceed this"],
                            ] as [string, number, string, string][]).map(([lbl, val, clr, sub]) => (
                              <div key={lbl}
                                className="rounded-xl border p-4 text-center"
                                style={{ borderColor: clr + "30", background: clr + "08" }}>
                                <p className="text-lg font-black font-mono" style={{ color: clr }}>
                                  {fmtMoney(val)}
                                </p>
                                <p className="text-xs text-white font-medium mt-1">{lbl}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
