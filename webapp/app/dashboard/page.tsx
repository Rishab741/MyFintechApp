"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { engine } from "@/lib/engine";
import MetricCard from "@/components/ui/metric-card";
import PortfolioChart from "@/components/charts/portfolio-chart";
import { TrendingUp, Activity, Shield, Zap } from "lucide-react";

async function getJwt() {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? "";
}

function useMetrics() {
  return useSWR("metrics", async () => {
    const jwt = await getJwt();
    return engine.portfolio.metrics(jwt, "1Y");
  });
}

function useTenant() {
  return useSWR("tenant", async () => {
    const jwt = await getJwt();
    return engine.tenant.me(jwt);
  });
}

function useUsage() {
  return useSWR("usage", async () => {
    const jwt = await getJwt();
    return engine.tenant.usage(jwt);
  });
}

function pct(v: number | null) {
  if (v === null) return null;
  return `${(v * 100).toFixed(2)}%`;
}

export default function DashboardOverview() {
  const { data: metrics, isLoading: mLoading } = useMetrics();
  const { data: tenant }                        = useTenant();
  const { data: usage }                         = useUsage();

  const twr = metrics?.twr !== undefined ? pct(metrics.twr) : null;
  const twrTrend = metrics?.twr !== undefined && metrics.twr !== null
    ? (metrics.twr >= 0 ? "positive" : "negative")
    : "neutral";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Overview</h1>
          <p className="text-sm text-muted mt-0.5">
            {tenant?.name ?? "—"} · <span className="capitalize">{tenant?.tier ?? "—"}</span>
          </p>
        </div>
        {metrics?.computed_at && (
          <p className="text-xs text-muted">
            Updated {new Date(metrics.computed_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Time-Weighted Return"
          value={twr}
          icon={TrendingUp}
          trend={twrTrend}
          sub="1-year period"
          loading={mLoading}
        />
        <MetricCard
          label="Sharpe Ratio"
          value={metrics?.sharpe ?? null}
          icon={Activity}
          trend={metrics?.sharpe !== null && metrics?.sharpe !== undefined && metrics.sharpe >= 1 ? "positive" : "neutral"}
          sub="Risk-adjusted return"
          loading={mLoading}
        />
        <MetricCard
          label="Max Drawdown"
          value={metrics?.max_drawdown !== undefined && metrics?.max_drawdown !== null ? pct(metrics.max_drawdown) : null}
          icon={TrendingUp}
          trend="negative"
          sub="Peak to trough"
          loading={mLoading}
        />
        <MetricCard
          label="API Calls Today"
          value={usage?.api_calls ?? null}
          icon={Zap}
          sub={usage?.daily_limit ? `of ${usage.daily_limit.toLocaleString()} limit` : "Unlimited"}
          loading={!usage}
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="CAGR"        value={pct(metrics?.cagr ?? null)}          trend={metrics?.cagr !== null && metrics?.cagr !== undefined && metrics.cagr >= 0 ? "positive" : "negative"} loading={mLoading} />
        <MetricCard label="Sortino"     value={metrics?.sortino ?? null}                                                         loading={mLoading} />
        <MetricCard label="Beta"        value={metrics?.beta ?? null}                                                            loading={mLoading} />
        <MetricCard label="Volatility"  value={pct(metrics?.volatility ?? null)}                                                  loading={mLoading} />
      </div>

      {/* Ledger status banner */}
      <LedgerBanner />
    </div>
  );
}

function LedgerBanner() {
  const { data, isLoading } = useSWR("ledger-verify", async () => {
    const jwt = await getJwt();
    return engine.ledger.verify(jwt);
  });

  if (isLoading) return null;
  if (!data) return null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
      data.chain_ok
        ? "bg-positive/10 border-positive/20 text-positive"
        : "bg-negative/10 border-negative/20 text-negative"
    }`}>
      <Shield size={16} />
      {data.chain_ok
        ? `Ledger chain intact — ${data.tx_count.toLocaleString()} transactions verified`
        : `⚠ ${data.broken_links.length} broken link(s) detected in transaction chain`}
    </div>
  );
}
