"use client";

import useSWR from "swr";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import { TrendingUp, TrendingDown, Minus, Briefcase, DollarSign, PieChart, Hash } from "lucide-react";
import { DataGate } from "@/components/data-gate";

function useExposure() {
  return useSWR("exposure", async () => engine.portfolio.exposure(await getJwt()));
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtUsd(n: number) {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-white/5 rounded animate-pulse ${className}`} />;
}

const ASSET_CLASS_COLORS: Record<string, string> = {
  equity:      "#8B5CF6",
  fixed_income:"#10B981",
  crypto:      "#F59E0B",
  cash:        "#6B7280",
  commodity:   "#3B82F6",
  real_estate: "#EC4899",
  other:       "#6B7280",
};

const SECTOR_COLORS = [
  "#8B5CF6", "#10B981", "#3B82F6", "#F59E0B",
  "#EC4899", "#EF4444", "#06B6D4", "#84CC16",
];

export default function HoldingsPage() {
  const { data, isLoading } = useExposure();

  const byClass = data?.by_asset_class ?? [];
  const bySector = data?.by_sector ?? [];
  const topPos  = data?.concentration?.largest_position;

  const summaryCards = [
    {
      label: "Total Value",
      value: data ? fmtUsd(data.total_value) : null,
      icon:  DollarSign,
    },
    {
      label: "Invested",
      value: data ? fmtUsd(data.invested_value) : null,
      icon:  TrendingUp,
    },
    {
      label: "Cash",
      value: data ? fmtUsd(data.cash_value) : null,
      icon:  Minus,
    },
    {
      label: "Positions",
      value: data ? String(data.position_count) : null,
      icon:  Hash,
    },
  ];

  return (
    <DataGate description="Your current positions, asset class breakdown, sector allocation, and concentration risk will appear here.">
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-white">Holdings</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Current positions and portfolio allocation</p>
        </div>
        {data?.position_count != null && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", color: "#8B5CF6" }}>
            <Briefcase size={12} />
            {data.position_count} positions
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl p-5 flex flex-col gap-3"
            style={{ background: "#111118", border: "1px solid #1A1A28" }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">{label}</p>
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/8">
                <Icon size={13} className="text-accent" />
              </div>
            </div>
            {isLoading || !value
              ? <Skeleton className="h-7 w-24" />
              : <p className="text-[24px] font-bold text-white leading-none">{value}</p>}
          </div>
        ))}
      </div>

      {/* Asset class + sector grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* By Asset Class */}
        <div className="rounded-xl p-5" style={{ background: "#111118", border: "1px solid #1A1A28" }}>
          <div className="flex items-center gap-2 mb-5">
            <PieChart size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-white">By Asset Class</h2>
          </div>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : byClass.length === 0 ? (
            <p className="text-sm text-[#4B5563] text-center py-6">No holdings data yet</p>
          ) : (
            <div className="space-y-4">
              {byClass.map((seg) => {
                const color = ASSET_CLASS_COLORS[seg.asset_class] ?? "#6B7280";
                return (
                  <div key={seg.asset_class}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white capitalize font-medium">{seg.asset_class.replace("_", " ")}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[#6B7280] text-xs">{fmtUsd(seg.market_value)}</span>
                        <span className="text-xs font-semibold" style={{ color }}>{fmt(seg.allocation_pct, 1)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(seg.allocation_pct, 100)}%`,
                          background: `linear-gradient(90deg, ${color}cc, ${color})`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* By Sector */}
        <div className="rounded-xl p-5" style={{ background: "#111118", border: "1px solid #1A1A28" }}>
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-white">By Sector</h2>
          </div>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : bySector.length === 0 ? (
            <p className="text-sm text-[#4B5563] text-center py-6">No sector data yet</p>
          ) : (
            <div className="space-y-4">
              {bySector.slice(0, 8).map((seg, i) => {
                const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
                return (
                  <div key={seg.sector ?? i}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white font-medium">{seg.sector ?? "Unknown"}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[#6B7280] text-xs">{fmtUsd(seg.market_value)}</span>
                        <span className="text-xs font-semibold" style={{ color }}>{fmt(seg.allocation_pct, 1)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(seg.allocation_pct, 100)}%`,
                          background: `linear-gradient(90deg, ${color}99, ${color})`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Concentration risk */}
      {data && (
        <div className="rounded-xl p-5" style={{ background: "#111118", border: "1px solid #1A1A28" }}>
          <h2 className="text-sm font-semibold text-white mb-5">Concentration Risk</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: "Top 3 positions",   value: `${fmt(data.concentration.top_3_pct, 1)}%`,       warn: data.concentration.top_3_pct > 60 },
              { label: "Top 10 positions",  value: `${fmt(data.concentration.top_10_pct, 1)}%`,      warn: data.concentration.top_10_pct > 90 },
              { label: "Herfindahl Index",  value: fmt(data.concentration.herfindahl_index, 4),       warn: data.concentration.herfindahl_index > 0.25 },
              { label: "Effective N",       value: String(data.concentration.effective_n),            warn: data.concentration.effective_n < 5 },
            ].map(({ label, value, warn }) => (
              <div key={label}>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563] mb-1.5">{label}</p>
                <p className={`text-[22px] font-bold ${warn ? "text-[#F59E0B]" : "text-white"}`}>{value}</p>
              </div>
            ))}
          </div>
          {topPos && (
            <div className="mt-5 pt-4 flex items-center gap-3"
              style={{ borderTop: "1px solid #1A1A28" }}>
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 text-accent text-xs font-bold shrink-0">
                {topPos.symbol.slice(0, 2)}
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Largest position</p>
                <p className="text-sm text-white font-medium">
                  {topPos.symbol} —{" "}
                  <span className="text-accent">{fmt(topPos.allocation_pct, 1)}%</span>
                  {" "}of portfolio ({fmtUsd(topPos.market_value)})
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </DataGate>
  );
}
