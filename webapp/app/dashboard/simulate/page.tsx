"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, AlertCircle, BarChart2, ChevronDown, ChevronRight,
  GitBranch, Loader2, Play, Plus, Sigma, Sparkles, Trash2, X,
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
  { value: "hold",             label: "Buy & Hold"        },
  { value: "monthly",          label: "Monthly Rebalance" },
  { value: "quarterly",        label: "Quarterly Rebalance" },
  { value: "threshold_10pct",  label: "±10% Threshold"   },
  { value: "threshold_20pct",  label: "±20% Threshold"   },
];
const FEATURED = ["SPY", "QQQ", "BTC-USD", "NVDA", "AAPL", "MSFT", "GLD"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(v: number) {
  const s = v >= 0 ? "+" : "";
  return `${s}${(v * 100).toFixed(2)}%`;
}
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
function MetricCell({
  v, format = "pct", lowerBetter = false,
  best,
}: { v: number | undefined; format?: "pct" | "raw" | "money"; lowerBetter?: boolean; best?: number }) {
  const isBest = v !== undefined && v === best;
  const display = v === undefined ? "—" :
    format === "pct"   ? pct(v) :
    format === "money" ? fmtMoney(v) :
    v.toFixed(2);
  const good = v === undefined ? false : lowerBetter ? v === best : v === best;
  return (
    <td className={`px-3 py-2.5 text-right text-sm font-mono ${
      isBest ? "text-white font-bold" : "text-slate-300"
    }`}>
      {display}
      {isBest && <span className="ml-1 text-xs text-green-400">▲</span>}
    </td>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SimulatePage() {
  // ── Form state ────────────────────────────────────────────────────────────
  const [assets,          setAssets]         = useState<string[]>(["SPY"]);
  const [assetInput,      setAssetInput]     = useState("");
  const [months,          setMonths]         = useState(24);
  const [rebalancing,     setRebalancing]    = useState("hold");
  const [runMC,           setRunMC]          = useState(false);
  const [applyBehavioral, setApplyBehavioral] = useState(true);
  const [savings,         setSavings]        = useState("1000");

  // ── Job state ─────────────────────────────────────────────────────────────
  type Phase = "idle" | "starting" | "running" | "complete" | "failed";
  const [phase,    setPhase]   = useState<Phase>("idle");
  const [elapsed,  setElapsed] = useState(0);
  const [result,   setResult]  = useState<SimJobResult | null>(null);
  const [errorMsg, setError]   = useState<string | null>(null);

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt  = useRef<number>(0);

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
    startedAt.current = Date.now();

    try {
      const supabase = createClient();
      const [{ data: { user } }, { data: { session } }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
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

      // Elapsed timer
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 1000);

      // Poll every 2 s
      pollRef.current = setInterval(async () => {
        try {
          const status = await engine.simulate.poll(jwt, job_id);
          if (status.status === "complete") {
            clearInterval(pollRef.current!);
            clearInterval(timerRef.current!);
            setResult(status);
            setPhase("complete");
          } else if (status.status === "failed") {
            clearInterval(pollRef.current!);
            clearInterval(timerRef.current!);
            setError(status.error ?? "Simulation failed");
            setPhase("failed");
          }
        } catch { /* transient errors */ }
      }, 2000);

    } catch (e: any) {
      clearInterval(timerRef.current!);
      setError(e.message ?? "Failed to start");
      setPhase("failed");
    }
  }

  // ── Metric keys + best-per-row finder ────────────────────────────────────
  const metricKeys = result?.metrics ? Object.keys(result.metrics) : [];

  function bestOf(key: keyof SimAssetMetrics, lowerBetter = false) {
    if (!result?.metrics) return undefined;
    const vals = metricKeys.map(k => result.metrics![k]?.[key] as number | undefined).filter(v => v !== undefined) as number[];
    if (!vals.length) return undefined;
    return lowerBetter ? Math.min(...vals) : Math.max(...vals);
  }

  // ── Decision tree expand state ────────────────────────────────────────────
  const [showAllNodes, setShowAllNodes] = useState(false);
  const nodes = result?.inflection_points ?? [];
  const visibleNodes = showAllNodes ? nodes : nodes.slice(0, 3);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Sigma size={18} className="text-accent" />
            Counterfactual Simulation Engine
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Replay your actual trade history against any asset — with behavioral adjustment, Monte Carlo, and decision impact scoring
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6 items-start">

        {/* ── Configuration panel ─────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-5 sticky top-4">

          {/* Asset picker */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wide mb-2">Compare Against (up to 5)</label>
            <div className="flex gap-2 mb-2">
              <input
                value={assetInput}
                onChange={e => setAssetInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && addAsset(assetInput)}
                placeholder="e.g. NVDA, BTC-USD"
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={() => addAsset(assetInput)}
                disabled={assets.length >= 5}
                className="px-3 py-2 bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent rounded-lg transition-colors disabled:opacity-40"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Featured chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {FEATURED.map(sym => (
                <button
                  key={sym}
                  onClick={() => addAsset(sym)}
                  disabled={assets.includes(sym) || assets.length >= 5}
                  className="text-xs px-2 py-1 rounded-full border border-border text-muted hover:text-white hover:border-accent/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {sym}
                </button>
              ))}
            </div>

            {/* Selected chips */}
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
              {assets.length === 0 && <p className="text-xs text-muted italic">No assets selected</p>}
            </div>
          </div>

          {/* Period */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wide mb-2">Lookback Period</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PERIODS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setMonths(p.months)}
                  className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    months === p.months
                      ? "bg-accent/20 border-accent text-accent"
                      : "bg-surface border-border text-muted hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rebalancing */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wide mb-2">Rebalancing Strategy</label>
            <div className="relative">
              <select
                value={rebalancing}
                onChange={e => setRebalancing(e.target.value)}
                className="w-full appearance-none bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50 pr-8"
              >
                {REBAL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>
          </div>

          {/* Monthly savings */}
          <div>
            <label className="block text-xs text-muted uppercase tracking-wide mb-2">Monthly Savings Assumption (USD)</label>
            <input
              type="number"
              value={savings}
              onChange={e => setSavings(e.target.value)}
              min={0}
              placeholder="1000"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-2.5">
            {([
              ["Behavioral Adjustment (BACS)",  applyBehavioral, setApplyBehavioral],
              ["Monte Carlo Simulation (1 000 paths)", runMC, setRunMC],
            ] as [string, boolean, React.Dispatch<React.SetStateAction<boolean>>][]).map(([lbl, val, setter]) => (
              <label key={lbl} className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => setter(!val)}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${val ? "bg-accent" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${val ? "translate-x-4" : ""}`} />
                </div>
                <span className="text-sm text-muted group-hover:text-white transition-colors">{lbl}</span>
              </label>
            ))}
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={!assets.length || phase === "starting" || phase === "running"}
            className="flex items-center justify-center gap-2 w-full py-3 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
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

          {phase === "running" && (
            <p className="text-xs text-muted text-center animate-pulse">
              Replaying trade history against {assets.length} asset{assets.length > 1 ? "s" : ""}…
              {runMC ? " + 1 000 Monte Carlo paths" : ""}
            </p>
          )}
        </div>

        {/* ── Results panel ───────────────────────────────────────────── */}
        <div className="space-y-5 min-h-[400px]">

          {/* Idle state */}
          {phase === "idle" && (
            <div className="bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center py-20 text-center px-8 gap-4">
              <Sigma size={40} className="text-muted" />
              <p className="text-muted text-sm">Configure your simulation on the left and click Run.</p>
              <p className="text-xs text-muted max-w-xs">
                The engine replays your actual cash flows into each comparison asset, applies behavioral biases,
                and computes risk-adjusted metrics side by side.
              </p>
            </div>
          )}

          {/* Running */}
          {(phase === "starting" || phase === "running") && (
            <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={36} className="text-accent animate-spin" />
              <div className="text-center">
                <p className="text-white font-medium">Simulating…</p>
                <p className="text-muted text-sm mt-1">{elapsed}s elapsed · typically 10–30 seconds</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {assets.map((sym, i) => (
                  <span key={sym} className="text-xs px-2 py-1 rounded-full font-mono border"
                    style={{ color: PALETTE[i], borderColor: PALETTE[i] + "44" }}>
                    {sym}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {phase === "failed" && errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium text-sm">Simulation failed</p>
                <p className="text-muted text-xs mt-1">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* ── Results ──────────────────────────────────────────────── */}
          {phase === "complete" && result && result.timeseries && (
            <>
              {/* Header badges */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted font-mono bg-card border border-border rounded-full px-3 py-1">
                  ✓ {result.computation_ms}ms
                </span>
                <span className="text-xs text-muted font-mono bg-card border border-border rounded-full px-3 py-1">
                  Quality {((result.data_quality_score ?? 0) * 100).toFixed(0)}%
                </span>
                {runMC && result.monte_carlo && (
                  <span className="text-xs font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full px-3 py-1">
                    Monte Carlo included
                  </span>
                )}
              </div>

              {/* ── Growth chart ────────────────────────────────────── */}
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted uppercase tracking-wide font-medium mb-4">
                  Indexed Growth (base = 100 at start)
                </p>
                <ComparisonChart timeseries={result.timeseries} />
              </div>

              {/* ── Metrics table ────────────────────────────────────── */}
              {result.metrics && metricKeys.length > 0 && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <BarChart2 size={14} className="text-accent" />
                    <p className="text-sm font-medium text-white">Risk-Adjusted Metrics</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-4 py-2.5 text-left text-xs text-muted font-medium">Metric</th>
                          {metricKeys.map((k, i) => (
                            <th key={k} className="px-3 py-2.5 text-right text-xs font-mono font-medium"
                              style={{ color: PALETTE[i] ?? "#607A93" }}>
                              {k === "actual" ? "Portfolio" : k.split("_")[0]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
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
                                <td className="px-4 py-2.5 text-xs text-muted font-mono">{lbl}</td>
                                {metricKeys.map(mk => (
                                  <MetricCell
                                    key={mk}
                                    v={result.metrics![mk]?.[key] as number | undefined}
                                    format={fmt}
                                    lowerBetter={lowerBetter}
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
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-purple-400" />
                    <p className="text-sm font-semibold text-purple-300">Temporal Opportunity Index</p>
                    {result.temporal_opportunity.best_alternative && (
                      <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Best: {result.temporal_opportunity.best_alternative}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div className="bg-card border border-border rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-white font-mono">
                        {fmtMoney(result.temporal_opportunity.best_dollar_gap)}
                      </p>
                      <p className="text-xs text-muted mt-1">Best dollar gap</p>
                    </div>
                    {Object.entries(result.temporal_opportunity.alternatives).slice(0, 3).map(([sym, alt]) => (
                      <div key={sym} className="bg-card border border-border rounded-xl p-3 text-center">
                        <p className="text-xs text-muted mb-1 font-mono">{sym}</p>
                        <p className={`text-lg font-bold font-mono ${alt.outperformed ? "text-red-400" : "text-green-400"}`}>
                          {alt.months_to_recover > 0 ? `${alt.months_to_recover}mo` : "Ahead"}
                        </p>
                        <p className="text-xs text-muted mt-0.5">to recover</p>
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
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <GitBranch size={14} className="text-accent" />
                    <p className="text-sm font-medium text-white">Decision Impact Tree</p>
                    <span className="ml-auto text-xs text-muted">{nodes.length} trade nodes analysed</span>
                  </div>
                  <div className="divide-y divide-border">
                    {visibleNodes.map((node, i) => {
                      const isBuy = node.transaction_type === "buy";
                      return (
                        <div key={i} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-3 mb-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold ${
                              isBuy ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                            }`}>
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                            <span className="font-mono font-bold text-white text-sm">{node.symbol}</span>
                            <span className="text-xs text-muted">{node.date?.slice(0, 10)}</span>
                            <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">
                              Impact {node.impact_score.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <div className="text-center min-w-[72px]">
                              <p className="text-xs text-muted mb-0.5">Actual 30d</p>
                              <p className={`text-sm font-bold font-mono ${node.actual_delta_30d >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {pct(node.actual_delta_30d)}
                              </p>
                            </div>
                            {Object.entries(node.alt_deltas_30d).slice(0, 5).map(([sym, delta]) => (
                              <div key={sym} className="text-center min-w-[72px]">
                                <p className="text-xs text-muted mb-0.5 font-mono">{sym}</p>
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
                      className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-muted hover:text-white transition-colors border-t border-border"
                    >
                      {showAllNodes ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {showAllNodes ? "Show fewer" : `Show all ${nodes.length} nodes`}
                    </button>
                  )}
                </div>
              )}

              {/* ── Monte Carlo Fan Charts ────────────────────────────── */}
              {result.monte_carlo && Object.keys(result.monte_carlo).length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-amber-500/15 flex items-center gap-2">
                    <Activity size={14} className="text-amber-400" />
                    <p className="text-sm font-semibold text-amber-300">Monte Carlo Projection · 1 000 Paths</p>
                  </div>
                  <p className="px-5 py-3 text-xs text-muted border-b border-amber-500/10">
                    Outer band = 10th–90th percentile · Inner band = 25th–75th · Line = median (p50)
                  </p>
                  <div className="divide-y divide-amber-500/10">
                    {Object.entries(result.monte_carlo).map(([key, fan], si) => {
                      const color = PALETTE[metricKeys.indexOf(key)] ?? PALETTE[si] ?? "#607A93";
                      const label = key === "actual" ? "Your Portfolio" : key.replace(/_/g, " ");
                      const endP10 = fan.p10[fan.p10.length - 1];
                      const endP50 = fan.p50[fan.p50.length - 1];
                      const endP90 = fan.p90[fan.p90.length - 1];
                      return (
                        <div key={key} className="p-5 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                            <p className="text-sm font-mono font-bold" style={{ color }}>{label}</p>
                          </div>
                          <MonteCarloChart fan={fan} color={color} />
                          <div className="grid grid-cols-3 gap-3">
                            {([
                              ["P10 (Bear)", endP10, "#FF716C"],
                              ["P50 (Median)", endP50, color],
                              ["P90 (Bull)", endP90, "#10B981"],
                            ] as [string, number, string][]).map(([lbl, val, clr]) => (
                              <div key={lbl} className="bg-surface border border-border rounded-lg p-3 text-center">
                                <p className="text-sm font-bold font-mono" style={{ color: clr }}>
                                  {fmtMoney(val ?? 0)}
                                </p>
                                <p className="text-xs text-muted mt-1">{lbl}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
