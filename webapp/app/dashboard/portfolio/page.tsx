"use client";

import useSWR from "swr";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { engine } from "@/lib/engine";
import MetricCard from "@/components/ui/metric-card";
import { TrendingUp, Activity, Target, BarChart2, Percent, Minus } from "lucide-react";

async function getJwt() {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? "";
}

const PERIODS = ["1M", "3M", "6M", "1Y", "3Y", "ALL"] as const;

function pct(v: number | null | undefined, decimals = 2) {
  if (v == null) return null;
  return `${(v * 100).toFixed(decimals)}%`;
}

export default function PortfolioPage() {
  const [period, setPeriod] = useState<string>("1Y");

  const { data, isLoading } = useSWR(["metrics", period], async () => {
    const jwt = await getJwt();
    return engine.portfolio.metrics(jwt, period);
  });

  const twr    = data?.twr    !== undefined ? (data.twr    !== null ? (data.twr >= 0 ? "positive" : "negative") as const : "neutral" as const) : "neutral" as const;
  const cagr   = data?.cagr   !== undefined ? (data.cagr   !== null ? (data.cagr >= 0 ? "positive" : "negative") as const : "neutral" as const) : "neutral" as const;
  const alpha  = data?.alpha  !== undefined ? (data.alpha  !== null ? (data.alpha >= 0 ? "positive" : "negative") as const : "neutral" as const) : "neutral" as const;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Portfolio Metrics</h1>

        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === p
                  ? "bg-accent text-white"
                  : "text-muted hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Returns */}
      <section>
        <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Returns</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard label="Time-Weighted Return" value={pct(data?.twr)}  icon={TrendingUp} trend={twr}  loading={isLoading} />
          <MetricCard label="CAGR"                 value={pct(data?.cagr)} icon={Percent}    trend={cagr} loading={isLoading} />
          <MetricCard label="Alpha vs SPY"         value={pct(data?.alpha)} icon={Target}    trend={alpha} loading={isLoading} sub="Benchmark: SPY" />
        </div>
      </section>

      {/* Risk */}
      <section>
        <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Risk</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard label="Sharpe Ratio"   value={data?.sharpe?.toFixed(2)    ?? null} icon={Activity}  trend={data?.sharpe !== null && data?.sharpe !== undefined && data.sharpe >= 1 ? "positive" : "neutral"} loading={isLoading} sub="Higher is better" />
          <MetricCard label="Sortino Ratio"  value={data?.sortino?.toFixed(2)   ?? null} icon={Activity}  loading={isLoading} />
          <MetricCard label="Max Drawdown"   value={pct(data?.max_drawdown)}              icon={Minus}    trend="negative" loading={isLoading} sub="Peak-to-trough" />
        </div>
      </section>

      {/* Market */}
      <section>
        <h2 className="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Market Exposure</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard label="Beta"       value={data?.beta?.toFixed(3)       ?? null} icon={BarChart2} loading={isLoading} sub="vs SPY" />
          <MetricCard label="Volatility" value={pct(data?.volatility)}                                 loading={isLoading} sub="Annualised" />
        </div>
      </section>

      {data?.computed_at && (
        <p className="text-xs text-muted text-right">
          Computed {new Date(data.computed_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
