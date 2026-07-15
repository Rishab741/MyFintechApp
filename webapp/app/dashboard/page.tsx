"use client";

import useSWR from "swr";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import PortfolioChart from "@/components/charts/portfolio-chart";
import {
  TrendingUp, TrendingDown, Activity, Shield, Zap,
  AlertTriangle, Heart, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import Link from "next/link";
import { DataGate } from "@/components/data-gate";

function useMetrics()    { return useSWR("metrics",     async () => engine.portfolio.metrics(await getJwt(), "1Y")); }
function useTenant()     { return useSWR("tenant",      async () => engine.tenant.me(await getJwt())); }
function useUsage()      { return useSWR("usage",       async () => engine.tenant.usage(await getJwt())); }
function useHistory()    { return useSWR("history-3m",  async () => engine.portfolio.history(await getJwt(), "3M")); }
function useHealthScore(){ return useSWR("health-score",async () => engine.portfolio.healthScore(await getJwt())); }

function pct(v: number | null | undefined) {
  if (v == null) return null;
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

function num(v: number | null | undefined, decimals = 2) {
  if (v == null) return null;
  return v.toFixed(decimals);
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-white/5 rounded animate-pulse ${className}`} />;
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  loading,
}: {
  label:    string;
  value:    string | number | null;
  sub?:     string;
  icon?:    React.ElementType;
  trend?:   "positive" | "negative" | "neutral";
  loading?: boolean;
}) {
  const trendColor =
    trend === "positive" ? "text-[#10B981]" :
    trend === "negative" ? "text-[#EF4444]" :
    "text-white";

  const TrendIcon =
    trend === "positive" ? ArrowUpRight :
    trend === "negative" ? ArrowDownRight :
    null;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 transition-all hover:border-[#2A2A3E]"
      style={{ background: "#111118", border: "1px solid #1A1A28" }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
          {label}
        </p>
        {Icon && (
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/8 shrink-0">
            <Icon size={13} className="text-accent" />
          </div>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="flex items-end gap-2">
          <span className={`text-[28px] font-bold leading-none ${trendColor}`}>
            {value ?? "—"}
          </span>
          {TrendIcon && value != null && (
            <TrendIcon size={16} className={`${trendColor} mb-1 shrink-0`} />
          )}
        </div>
      )}
      {sub && (
        <p className="text-[12px] text-[#4B5563] -mt-1">{sub}</p>
      )}
    </div>
  );
}

export default function DashboardOverview() {
  const { data: metrics, isLoading: mLoading } = useMetrics();
  const { data: tenant }                        = useTenant();
  const { data: usage }                         = useUsage();
  const { data: history }                       = useHistory();
  const { data: healthScore }                   = useHealthScore();

  const twrPct    = pct(metrics?.twr);
  const twrTrend  = metrics?.twr != null ? (metrics.twr >= 0 ? "positive" : "negative") : "neutral";
  const cagrPct   = pct(metrics?.cagr);
  const cagrTrend = metrics?.cagr != null ? (metrics.cagr >= 0 ? "positive" : "negative") : "neutral";
  const ddPct     = pct(metrics?.max_drawdown);

  const gradeColor =
    healthScore?.grade === "A" || healthScore?.grade === "B"
      ? "text-[#10B981]"
      : healthScore?.grade === "C"
      ? "text-[#F59E0B]"
      : "text-[#EF4444]";

  return (
    <DataGate description="Your TWR, Sharpe ratio, drawdown analysis, and AI-generated portfolio insights will appear here.">
    <div className="max-w-6xl mx-auto space-y-5">

      {/* ── Stale data banner ────────────────────────────────────────────── */}
      {metrics?.is_data_stale && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.18)",
            color: "#F59E0B",
          }}
        >
          <AlertTriangle size={15} className="shrink-0" />
          <span>
            Portfolio prices are{" "}
            <strong>{Math.round(metrics.snapshot_age_hours)}h old</strong> —
            NAV and all derived metrics may be incorrect. Trigger a price sync to refresh.
          </span>
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-white">Overview</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            {tenant?.name ?? "—"}
            {tenant?.tier && (
              <>
                {" · "}
                <span className="capitalize">{tenant.tier}</span>
              </>
            )}
          </p>
        </div>
        {metrics?.computed_at && (
          <p className="text-xs text-[#4B5563]">
            Updated {new Date(metrics.computed_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* ── Metric row 1 ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Time-Weighted Return"
          value={twrPct}
          icon={TrendingUp}
          trend={twrTrend}
          sub="1-year period"
          loading={mLoading}
        />
        <MetricCard
          label="Sharpe Ratio"
          value={num(metrics?.sharpe)}
          icon={Activity}
          trend={metrics?.sharpe != null && metrics.sharpe >= 1 ? "positive" : "neutral"}
          sub="Risk-adjusted return"
          loading={mLoading}
        />
        <MetricCard
          label="Max Drawdown"
          value={ddPct}
          icon={TrendingDown}
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

      {/* ── Metric row 2 ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="CAGR"       value={cagrPct}                  trend={cagrTrend} loading={mLoading} />
        <MetricCard label="Sortino"    value={num(metrics?.sortino)}     loading={mLoading} />
        <MetricCard label="Beta"       value={num(metrics?.beta)}        loading={mLoading} />
        <MetricCard label="Volatility" value={pct(metrics?.volatility)}  loading={mLoading} />
      </div>

      {/* ── Health + NAV row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Health score card */}
        <Link href="/dashboard/health-score" className="block group">
          <div
            className="rounded-xl p-5 h-full flex flex-col transition-all group-hover:border-accent/25"
            style={{ background: "#111118", border: "1px solid #1A1A28" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/8">
                <Heart size={13} className="text-accent" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
                Portfolio Health
              </p>
            </div>

            {healthScore ? (
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-[60px] font-bold text-white leading-none">
                      {healthScore.score}
                    </span>
                    <span className="text-[24px] font-semibold text-accent mb-1">/ 100</span>
                    <span className={`text-[22px] font-bold mb-1 ml-auto ${gradeColor}`}>
                      {healthScore.grade}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#6B7280] leading-relaxed line-clamp-2">
                    {healthScore.insights[0]}
                  </p>
                </div>
                <p className="text-[12px] text-accent mt-4 flex items-center gap-1">
                  View details <ArrowUpRight size={11} />
                </p>
              </div>
            ) : (
              <div className="flex-1 space-y-3">
                <Skeleton className="h-14 w-36" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            )}
          </div>
        </Link>

        {/* NAV chart */}
        <div
          className="lg:col-span-2 rounded-xl p-5"
          style={{ background: "#111118", border: "1px solid #1A1A28" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563] mb-4">
            Portfolio NAV — 3 Months
          </p>
          {history?.nav_series && history.nav_series.length > 1 ? (
            <PortfolioChart
              data={history.nav_series.map((p) => ({
                time: p.time,
                total_value: p.total_value,
              }))}
            />
          ) : (
            <div className="h-40 flex items-center justify-center text-[#4B5563] text-sm">
              {mLoading ? <Skeleton className="h-40 w-full rounded-lg" /> : "No NAV history — run a sync to populate"}
            </div>
          )}
        </div>
      </div>

      {/* ── Ledger status ────────────────────────────────────────────────── */}
      <LedgerBanner />
    </div>
    </DataGate>
  );
}

function LedgerBanner() {
  const { data, isLoading } = useSWR("ledger-verify", async () => {
    return engine.ledger.verify(await getJwt());
  });

  if (isLoading || !data) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
      style={
        data.chain_ok
          ? { background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)", color: "#10B981" }
          : { background: "rgba(239,68,68,0.06)",  border: "1px solid rgba(239,68,68,0.18)",  color: "#EF4444" }
      }
    >
      <Shield size={15} className="shrink-0" />
      {data.chain_ok
        ? `Ledger chain intact — ${data.tx_count.toLocaleString()} transactions verified`
        : `⚠ ${data.broken_links.length} broken link(s) detected in transaction chain`}
    </div>
  );
}
