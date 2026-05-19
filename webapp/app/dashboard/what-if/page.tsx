"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { engine, WhatIfResponse } from "@/lib/engine";
import WhatIfChart from "@/components/charts/what-if-chart";
import { TrendingUp, TrendingDown, Clock, Search } from "lucide-react";

async function getJwt() {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? "";
}

function pct(v: number) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function fmtUsd(v: number) {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const EXAMPLES = [
  { symbol: "NVDA", amount: 10000, start_date: "2022-01-01", label: "NVDA vs your portfolio (2022–now)" },
  { symbol: "QQQ",  amount: 10000, start_date: "2020-01-01", label: "QQQ vs your portfolio (2020–now)" },
  { symbol: "BTC-USD", amount: 5000, start_date: "2021-01-01", label: "Bitcoin vs your portfolio (2021–now)" },
];

export default function WhatIfPage() {
  const [symbol,    setSymbol]    = useState("NVDA");
  const [amount,    setAmount]    = useState("10000");
  const [startDate, setStartDate] = useState("2022-01-01");
  const [result,    setResult]    = useState<WhatIfResponse | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function run(sym = symbol, amt = amount, sd = startDate) {
    const amtNum = parseFloat(amt);
    if (!sym || isNaN(amtNum) || amtNum <= 0 || !sd) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const jwt = await getJwt();
      const data = await engine.portfolio.whatIf(jwt, sym.toUpperCase().trim(), amtNum, sd);
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function loadExample(ex: typeof EXAMPLES[0]) {
    setSymbol(ex.symbol);
    setAmount(String(ex.amount));
    setStartDate(ex.start_date);
    run(ex.symbol, String(ex.amount), ex.start_date);
  }

  const winnerLabel =
    result?.winner === "hypothetical" ? result.symbol :
    result?.winner === "portfolio"    ? "Your portfolio" :
    "SPY";

  const winnerReturn =
    result?.winner === "hypothetical" ? result.hypothetical_return :
    result?.winner === "portfolio"    ? result.actual_return :
    result?.benchmark_return ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <Clock size={18} className="text-accent" />
          What-if Time Machine
        </h1>
        <p className="text-sm text-muted mt-0.5">
          Compare a hypothetical investment against your actual portfolio and SPY
        </p>
      </div>

      {/* Input form */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">Ticker symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. NVDA"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Amount invested (USD)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={1}
              placeholder="10000"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Start date</label>
            <input
              type="date"
              value={startDate}
              max={new Date().toISOString().split("T")[0]}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>

        <button
          onClick={() => run()}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <Search size={14} />
          )}
          {loading ? "Fetching data…" : "Run comparison"}
        </button>

        {/* Quick examples */}
        <div className="flex flex-wrap gap-2 pt-1">
          {EXAMPLES.map(ex => (
            <button
              key={ex.label}
              onClick={() => loadExample(ex)}
              className="text-xs px-3 py-1.5 rounded-full border border-border text-muted hover:text-white hover:border-accent/40 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-negative/10 border border-negative/20 text-negative text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Winner callout */}
          <div className={`rounded-xl border p-4 flex items-center gap-4 ${
            result.winner === "hypothetical"
              ? "bg-purple-500/10 border-purple-500/20"
              : result.winner === "portfolio"
              ? "bg-positive/10 border-positive/20"
              : "bg-yellow-500/10 border-yellow-500/20"
          }`}>
            {winnerReturn >= 0
              ? <TrendingUp size={20} className="shrink-0 text-white" />
              : <TrendingDown size={20} className="shrink-0 text-white" />}
            <div>
              <p className="text-white font-semibold text-sm">
                {winnerLabel} won · {pct(winnerReturn)} total return
              </p>
              <p className="text-muted text-xs mt-0.5">
                {fmtUsd(result.amount_invested)} invested from {result.start_date} → {result.end_date}
              </p>
            </div>
          </div>

          {/* Return comparison cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label:  result.symbol,
                ret:    result.hypothetical_return,
                cagr:   result.hypothetical_cagr,
                final:  result.hypothetical_final,
                color:  "border-purple-500/30",
                winner: result.winner === "hypothetical",
              },
              {
                label:  "Your portfolio",
                ret:    result.actual_return,
                cagr:   result.actual_cagr,
                final:  result.amount_invested * (1 + result.actual_return),
                color:  "border-positive/30",
                winner: result.winner === "portfolio",
              },
              {
                label:  "SPY (benchmark)",
                ret:    result.benchmark_return,
                cagr:   result.benchmark_cagr,
                final:  result.amount_invested * (1 + result.benchmark_return),
                color:  "border-yellow-500/30",
                winner: result.winner === "benchmark",
              },
            ].map(card => (
              <div
                key={card.label}
                className={`bg-card border rounded-xl p-4 ${card.winner ? card.color : "border-border"}`}
              >
                <p className="text-xs text-muted mb-2">{card.label}</p>
                <p className={`text-2xl font-bold mb-1 ${card.ret >= 0 ? "text-positive" : "text-negative"}`}>
                  {pct(card.ret)}
                </p>
                <p className="text-sm text-white">{fmtUsd(card.final)}</p>
                <p className="text-xs text-muted mt-1">CAGR {pct(card.cagr)}</p>
                {card.winner && (
                  <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-white/10 text-white">
                    Winner
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs text-muted font-medium uppercase tracking-wide mb-4">
              Growth of {fmtUsd(result.amount_invested)} — {result.start_date} to {result.end_date}
            </p>
            <WhatIfChart
              data={result.time_series}
              symbol={result.symbol}
              amount={result.amount_invested}
            />
          </div>
        </>
      )}
    </div>
  );
}
