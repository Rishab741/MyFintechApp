"use client";
import { getJwt } from "@/lib/jwt";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { engine, type IngestResult, type RefreshResult } from "@/lib/engine";
import {
  makeSchwabHoldingsCsv,
  makeSchwabTransactionsCsv,
  csvToFile,
  downloadCsv,
  PORTFOLIO_SUMMARY,
} from "@/lib/sample-data";
import {
  Upload, RefreshCw, BarChart2, CheckCircle, Circle,
  ChevronRight, Download, FileText, Zap, Eye,
} from "lucide-react";



type StepState = "idle" | "running" | "done" | "error";

function StepBadge({ state }: { state: StepState }) {
  if (state === "done")    return <CheckCircle size={18} className="text-positive shrink-0" />;
  if (state === "running") return <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />;
  if (state === "error")   return <div className="w-4 h-4 rounded-full bg-negative/20 border border-negative shrink-0" />;
  return <Circle size={18} className="text-border shrink-0" />;
}

function ConnectorLine({ done }: { done: boolean }) {
  return (
    <div className={`w-px h-6 mx-auto my-1 transition-colors ${done ? "bg-positive/40" : "bg-border"}`} />
  );
}

// ── Step card wrapper ─────────────────────────────────────────────────────────
function Step({
  number, title, subtitle, state, children,
}: { number: number; title: string; subtitle: string; state: StepState; children: React.ReactNode }) {
  return (
    <div className={`bg-card border rounded-xl p-5 transition-colors ${
      state === "done"    ? "border-positive/30" :
      state === "running" ? "border-accent/40" :
      state === "error"   ? "border-negative/30" :
                            "border-border"
    }`}>
      <div className="flex items-start gap-3 mb-4">
        <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
          state === "done"    ? "bg-positive/20 text-positive" :
          state === "running" ? "bg-accent/20 text-accent" :
          state === "error"   ? "bg-negative/20 text-negative" :
                                "bg-white/5 text-muted"
        }`}>{number}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">{title}</p>
            <StepBadge state={state} />
          </div>
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Data flow label ───────────────────────────────────────────────────────────
function DataFlow({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted bg-white/3 rounded-lg px-3 py-2 mb-3">
      <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded">{from}</span>
      <ChevronRight size={12} className="text-accent" />
      <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded">{to}</span>
    </div>
  );
}

// ── Ingest step ───────────────────────────────────────────────────────────────
function IngestStep({
  number, title, subtitle, dataFrom, dataTo,
  csvType, onDone,
}: {
  number:  number;
  title:   string;
  subtitle: string;
  dataFrom: string;
  dataTo:   string;
  csvType:  "holdings" | "transactions";
  onDone:  (r: IngestResult) => void;
}) {
  const [state,   setState]   = useState<StepState>("idle");
  const [result,  setResult]  = useState<IngestResult | null>(null);
  const [file,    setFile]    = useState<File | null>(null);
  const [error,   setError]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function useSample() {
    const f = csvType === "holdings" ? csvToFile(makeSchwabHoldingsCsv(), "schwab_holdings.csv")
                                     : csvToFile(makeSchwabTransactionsCsv(), "schwab_transactions.csv");
    setFile(f);
    await upload(f);
  }

  async function upload(f: File) {
    setState("running");
    setError("");
    try {
      const jwt = await getJwt();
      const res = await engine.ingest.upload(jwt, "schwab", f, csvType);
      setResult(res);
      setState("done");
      onDone(res);
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
      setState("error");
    }
  }

  return (
    <Step number={number} title={title} subtitle={subtitle} state={state}>
      <DataFlow from={dataFrom} to={dataTo} />

      <div className="space-y-3">
        {/* Sample data info */}
        <div className="bg-white/3 rounded-lg p-3 text-xs text-muted space-y-1">
          {csvType === "holdings" ? (
            <>
              <p className="text-white font-medium mb-1.5">Sample portfolio: 9 positions</p>
              <div className="flex flex-wrap gap-1.5">
                {PORTFOLIO_SUMMARY.tickers.map(t => (
                  <span key={t} className="bg-accent/10 text-accent px-1.5 py-0.5 rounded font-mono">{t}</span>
                ))}
              </div>
              <p className="mt-1.5">Total value ~${PORTFOLIO_SUMMARY.currentValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
            </>
          ) : (
            <>
              <p className="text-white font-medium mb-1">Sample: 57 transactions (2024-2026)</p>
              <p>16 buys · 39 dividends · 1 deposit · 1 sell</p>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={useSample}
            disabled={state === "running"}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            <Zap size={12} />
            Use sample data
          </button>
          <button
            onClick={() => downloadCsv(
              csvType === "holdings" ? makeSchwabHoldingsCsv() : makeSchwabTransactionsCsv(),
              csvType === "holdings" ? "schwab_holdings.csv" : "schwab_transactions.csv",
            )}
            className="flex items-center gap-1.5 px-3 py-2 border border-border hover:border-white/30 text-muted hover:text-white text-xs rounded-lg transition-colors"
          >
            <Download size={12} />
            Download CSV
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={state === "running"}
            className="flex items-center gap-1.5 px-3 py-2 border border-border hover:border-white/30 text-muted hover:text-white text-xs rounded-lg transition-colors"
          >
            <Upload size={12} />
            Upload my own
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); upload(f); } }}
          />
        </div>

        {file && state !== "idle" && (
          <p className="text-xs text-muted flex items-center gap-1">
            <FileText size={11} />
            {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}

        {error && <p className="text-xs text-negative">{error}</p>}

        {result && state === "done" && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { label: "Holdings",     v: result.holdings_upserted     },
              { label: "Transactions", v: result.transactions_inserted },
              { label: "Skipped",      v: result.skipped               },
            ].map(({ label, v }) => (
              <div key={label} className="bg-positive/5 border border-positive/20 rounded-lg p-2 text-center">
                <p className="text-lg font-semibold text-positive">{v}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Step>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const [holdingsDone, setHoldingsDone] = useState(false);
  const [txDone,       setTxDone]       = useState(false);
  const [refreshState, setRefreshState] = useState<StepState>("idle");
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);
  const [refreshError,  setRefreshError]  = useState("");

  const { data: status, mutate: mutateStatus } = useSWR("pipeline-status", async () => {
    const jwt = await getJwt();
    return engine.portfolio.status(jwt);
  }, { refreshInterval: 5000 });

  async function runRefresh() {
    setRefreshState("running");
    setRefreshError("");
    try {
      const jwt = await getJwt();
      const res = await engine.portfolio.refresh(jwt);
      setRefreshResult(res);
      setRefreshState("done");
      mutateStatus();
    } catch (e: any) {
      setRefreshError(e.message ?? "Refresh failed");
      setRefreshState("error");
    }
  }

  const allDone = holdingsDone && txDone && refreshState === "done";

  return (
    <div className="max-w-2xl mx-auto space-y-1">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-white">Test Data Pipeline</h1>
        <p className="text-sm text-muted mt-0.5">
          Trace exactly how your data flows through Platstock — from raw CSV to computed metrics
        </p>
      </div>

      {/* Current state bar */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {[
          { label: "Holdings",  value: status?.holdings_count ?? "—"  },
          { label: "Snapshots", value: status?.snapshot_count ?? "—"  },
          { label: "Last sync", value: status?.last_synced_at
              ? new Date(status.last_synced_at).toLocaleTimeString()
              : "never" },
          { label: "Last compute", value: status?.last_computed_at
              ? new Date(status.last_computed_at).toLocaleTimeString()
              : "never" },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-base font-semibold text-white">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Step 1: Holdings ─────────────────────────────────────────────── */}
      <IngestStep
        number={1}
        title="Import Holdings"
        subtitle="Your current positions — what you own right now"
        dataFrom="schwab_positions.csv"
        dataTo="holdings table"
        csvType="holdings"
        onDone={() => setHoldingsDone(true)}
      />

      <ConnectorLine done={holdingsDone} />

      {/* ── Step 2: Transactions ─────────────────────────────────────────── */}
      <IngestStep
        number={2}
        title="Import Transactions"
        subtitle="Your trading history — buys, sells, dividends"
        dataFrom="schwab_transactions.csv"
        dataTo="transactions table (hash-chained)"
        csvType="transactions"
        onDone={() => setTxDone(true)}
      />

      <ConnectorLine done={txDone} />

      {/* ── Step 3: Sync + Compute ───────────────────────────────────────── */}
      <Step
        number={3}
        title="Sync Prices & Compute Metrics"
        subtitle="Fetch live prices from Yahoo Finance, then compute Sharpe, TWR, drawdown and 20+ metrics"
        state={refreshState}
      >
        <DataFlow from="Yahoo Finance + portfolio_snapshots_v2" to="performance_cache (8 periods)" />

        <div className="space-y-3">
          <div className="bg-white/3 rounded-lg p-3 text-xs text-muted space-y-1">
            <p className="text-white font-medium mb-1">What happens inside:</p>
            <div className="grid grid-cols-1 gap-0.5">
              {[
                "1. Fetch live prices for all 9 symbols from Yahoo Finance",
                "2. Write OHLCV rows to price_history",
                "3. Update last_price + open P&L on each holding",
                "4. Read 522 daily portfolio snapshots",
                "5. Compute TWR, CAGR, Sharpe, Sortino, Beta, Alpha, Drawdown...",
                "6. Write results to performance_cache (8 time periods)",
              ].map(s => <p key={s}>{s}</p>)}
            </div>
          </div>

          <button
            onClick={runRefresh}
            disabled={refreshState === "running" || (!holdingsDone && !status?.holdings_count)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
          >
            {refreshState === "running"
              ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <RefreshCw size={14} />}
            {refreshState === "running" ? "Running…" : "Run sync + compute"}
          </button>

          {refreshError && <p className="text-xs text-negative">{refreshError}</p>}

          {refreshResult && refreshState === "done" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {[
                { label: "Symbols synced",  v: refreshResult.symbols_synced },
                { label: "Symbols failed",  v: refreshResult.symbols_failed },
              ].map(({ label, v }) => (
                <div key={label} className="bg-positive/5 border border-positive/20 rounded-lg p-2 text-center">
                  <p className={`text-lg font-semibold ${label.includes("failed") && v > 0 ? "text-negative" : "text-positive"}`}>{v}</p>
                  <p className="text-xs text-muted">{label}</p>
                </div>
              ))}
              <div className="col-span-2 bg-positive/5 border border-positive/20 rounded-lg p-2 text-center">
                <p className="text-sm font-medium text-positive">
                  Computed: {refreshResult.periods_computed.join(" · ")}
                </p>
                <p className="text-xs text-muted">All periods in performance_cache</p>
              </div>
            </div>
          )}
        </div>
      </Step>

      <ConnectorLine done={allDone} />

      {/* ── Step 4: Explore results ──────────────────────────────────────── */}
      <Step
        number={4}
        title="Explore Results"
        subtitle="All metrics are live — click any view to see the data you just loaded"
        state={allDone ? "done" : "idle"}
      >
        <DataFlow from="performance_cache" to="dashboard UI" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { href: "/dashboard",              label: "Overview",      sub: "NAV chart + key metrics",        icon: BarChart2    },
            { href: "/dashboard/health-score", label: "Health Score",  sub: "0-100 composite score",          icon: CheckCircle  },
            { href: "/dashboard/what-if",      label: "What-if",       sub: "Compare vs NVDA, SPY, BTC",     icon: RefreshCw    },
            { href: "/dashboard/holdings",     label: "Holdings",      sub: "Positions + allocation",         icon: FileText     },
            { href: "/dashboard/portfolio",    label: "Analytics",     sub: "Sharpe, Sortino, Beta, VaR",    icon: BarChart2    },
            { href: "/dashboard/audit",        label: "Audit Log",     sub: "Every action is recorded",      icon: Eye          },
          ].map(({ href, label, sub, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                allDone
                  ? "border-border hover:border-accent/40 hover:bg-accent/5 cursor-pointer"
                  : "border-border/40 opacity-40 cursor-not-allowed pointer-events-none"
              }`}
            >
              <Icon size={16} className="text-accent shrink-0" />
              <div>
                <p className="text-sm text-white font-medium">{label}</p>
                <p className="text-xs text-muted">{sub}</p>
              </div>
              <ChevronRight size={14} className="text-muted ml-auto" />
            </Link>
          ))}
        </div>

        {!allDone && (
          <p className="text-xs text-muted text-center mt-3">
            Complete steps 1-3 to unlock all views
          </p>
        )}
      </Step>
    </div>
  );
}
