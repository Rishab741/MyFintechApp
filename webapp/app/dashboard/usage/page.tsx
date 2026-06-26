"use client";

import useSWR from "swr";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import { Zap, Activity, RefreshCw, ArrowUpRight } from "lucide-react";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-white/5 rounded animate-pulse ${className}`} />;
}

export default function UsagePage() {
  const { data, isLoading } = useSWR("usage", async () =>
    engine.tenant.usage(await getJwt())
  );

  const pctUsed =
    data?.daily_limit && data.daily_limit > 0
      ? Math.min((data.api_calls / data.daily_limit) * 100, 100)
      : null;

  const month = data?.month
    ? new Date(data.month).toLocaleString("default", { month: "long", year: "numeric" })
    : "—";

  const barColor =
    pctUsed == null    ? "#8B5CF6" :
    pctUsed > 90       ? "#EF4444" :
    pctUsed > 70       ? "#F59E0B" :
                         "#10B981";

  const card = { background: "#111118", border: "1px solid #1A1A28" };

  const statCards = [
    {
      label: "API Calls",
      value: data?.api_calls ?? null,
      icon:  Zap,
      sub:   data?.daily_limit ? `of ${data.daily_limit.toLocaleString()} daily` : "Unlimited",
    },
    {
      label: "Compute Runs",
      value: data?.compute_runs ?? null,
      icon:  Activity,
      sub:   "ML + Monte Carlo",
    },
    {
      label: "Price Syncs",
      value: data?.price_syncs ?? null,
      icon:  RefreshCw,
      sub:   "Market data refreshes",
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-white">Usage</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          {month}{data?.tier && ` · `}
          {data?.tier && <span className="capitalize">{data.tier}</span>} tier
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map(({ label, value, icon: Icon, sub }) => (
          <div key={label} className="rounded-xl p-5 flex flex-col gap-3" style={card}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">{label}</p>
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/8">
                <Icon size={13} className="text-accent" />
              </div>
            </div>
            {isLoading || value == null
              ? <Skeleton className="h-8 w-20" />
              : <p className="text-[28px] font-bold text-white leading-none">{value.toLocaleString()}</p>}
            <p className="text-[12px] text-[#4B5563] -mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Daily usage bar */}
      {pctUsed !== null && (
        <div className="rounded-xl p-5" style={card}>
          <div className="flex justify-between items-baseline mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">Daily API Calls</p>
            <p className="text-sm font-semibold text-white">
              {data?.api_calls?.toLocaleString()}
              <span className="text-[#4B5563] font-normal"> / {data?.daily_limit?.toLocaleString()}</span>
            </p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pctUsed}%`, background: `linear-gradient(90deg, ${barColor}88, ${barColor})` }}
            />
          </div>
          <p className="text-xs text-[#4B5563] mt-2">{pctUsed.toFixed(1)}% of daily limit used</p>
        </div>
      )}

      {/* Upgrade nudge */}
      {data?.tier === "self_serve" && (
        <div
          className="rounded-xl p-5 flex items-start justify-between gap-4"
          style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}
        >
          <div>
            <h3 className="font-semibold text-white text-sm mb-1">Upgrade to Starter</h3>
            <p className="text-sm text-[#6B7280]">
              Self-serve is capped at 500 API calls/day. Starter gives you 5,000 calls/day,
              portfolio webhooks, and priority support.
            </p>
          </div>
          <button
            className="shrink-0 flex items-center gap-1.5 text-accent text-sm font-medium whitespace-nowrap"
          >
            Upgrade <ArrowUpRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
