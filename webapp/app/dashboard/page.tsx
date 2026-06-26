"use client";

import useSWR from "swr";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import MetricCard from "@/components/ui/metric-card";
import PortfolioChart from "@/components/charts/portfolio-chart";
import { TrendingUp, Activity, Shield, Zap, AlertTriangle, Heart } from "lucide-react";
import Link from "next/link";


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

function useHistory() {
  return useSWR("history-3m", async () => {
    const jwt = await getJwt();
    return engine.portfolio.history(jwt, "3M");
  });
}

function useHealthScore() {
  return useSWR("health-score", async () => {
    const jwt = await getJwt();
    return engine.portfolio.healthScore(jwt);
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
  const { data: history }                       = useHistory();
  const { data: healthScore }                   = useHealthScore();

  const twr = metrics?.twr !== undefined ? pct(metrics.twr) : null;
  const twrTrend = metrics?.twr !== undefined && metrics.twr !== null
    ? (metrics.twr >= 0 ? "positive" : "negative")
    : "neutral";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Stale data warning — NAV and all metrics are unreliable when stale */}
      {metrics?.is_data_stale && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-yellow-500/10 border-yellow-500/20 text-yellow-400 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            Portfolio prices are <strong>{Math.round(metrics.snapshot_age_hours)}h old</strong> —
            NAV and all derived metrics (TWR, Sharpe, Drawdown) may be incorrect.
            Trigger a price sync to refresh.
          </span>
        </div>
      )}

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

      {/* Health Score + NAV Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Health Score card */}
        <Link href="/dashboard/health-score" className="block">
          <div className="bg-card border border-border rounded-xl p-5 hover:border-accent/40 transition-colors h-full">
            <div className="flex items-center gap-2 mb-3">
              <Heart size={14} className="text-accent" />
              <p className="text-xs text-muted font-medium uppercase tracking-wide">Portfolio Health</p>
            </div>
            {healthScore ? (
              <>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-5xl font-bold text-white">{healthScore.score}</span>
                  <span className="text-2xl font-semibold text-accent mb-1">/ 100</span>
                  <span className={`text-xl font-bold mb-1 ml-auto ${
                    healthScore.grade === "A" ? "text-positive" :
                    healthScore.grade === "B" ? "text-positive" :
                    healthScore.grade === "C" ? "text-yellow-400" :
                    "text-negative"
                  }`}>{healthScore.grade}</span>
                </div>
                <p className="text-xs text-muted line-clamp-2">{healthScore.insights[0]}</p>
              </>
            ) : (
              <div className="space-y-2">
                <div className="h-12 w-32 bg-white/5 rounded animate-pulse" />
                <div className="h-3 w-full bg-white/5 rounded animate-pulse" />
              </div>
            )}
          </div>
        </Link>

        {/* NAV Chart — spans 2 columns */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted font-medium uppercase tracking-wide mb-3">
            Portfolio NAV — 3 Months
          </p>
          {history?.nav_series && history.nav_series.length > 1 ? (
            <PortfolioChart
              data={history.nav_series.map(p => ({ time: p.time, total_value: p.total_value }))}
            />
          ) : (
            <div className="h-40 flex items-center justify-center text-muted text-sm">
              No NAV history available
            </div>
          )}
        </div>
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
