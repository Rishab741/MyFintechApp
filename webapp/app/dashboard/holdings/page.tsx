"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { engine } from "@/lib/engine";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

async function getJwt() {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? "";
}

function useExposure() {
  return useSWR("exposure", async () => {
    const jwt = await getJwt();
    return engine.portfolio.exposure(jwt);
  });
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtUsd(n: number) {
  return `$${fmt(n)}`;
}

export default function HoldingsPage() {
  const { data, isLoading } = useExposure();

  const byClass = data?.by_asset_class ?? [];
  const topPos  = data?.concentration?.largest_position;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Holdings</h1>
        <p className="text-sm text-muted mt-0.5">
          Current positions and portfolio allocation
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Value",    value: data ? fmtUsd(data.total_value)    : null },
          { label: "Invested",       value: data ? fmtUsd(data.invested_value) : null },
          { label: "Cash",           value: data ? fmtUsd(data.cash_value)     : null },
          { label: "Positions",      value: data ? String(data.position_count) : null },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted mb-1">{label}</p>
            {isLoading || !value
              ? <div className="h-6 w-24 bg-white/5 rounded animate-pulse" />
              : <p className="text-lg font-semibold text-white">{value}</p>}
          </div>
        ))}
      </div>

      {/* Asset class breakdown */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-white mb-4">By Asset Class</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {byClass.map((seg) => (
              <div key={seg.asset_class}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white capitalize">{seg.asset_class}</span>
                  <span className="text-muted">
                    {fmtUsd(seg.market_value)} · {fmt(seg.allocation_pct)}%
                  </span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${Math.min(seg.allocation_pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Concentration risk */}
      {data && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-white mb-4">Concentration Risk</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Top 3 positions",  value: `${fmt(data.concentration.top_3_pct)}%` },
              { label: "Top 10 positions", value: `${fmt(data.concentration.top_10_pct)}%` },
              { label: "HH Index",         value: fmt(data.concentration.herfindahl_index, 4) },
              { label: "Effective N",      value: String(data.concentration.effective_n) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-muted mb-1">{label}</p>
                <p className="text-base font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
          {topPos && (
            <p className="text-xs text-muted mt-4">
              Largest position: <span className="text-white font-medium">{topPos.symbol}</span>
              {" "}— {fmt(topPos.allocation_pct)}% of portfolio ({fmtUsd(topPos.market_value)})
            </p>
          )}
        </div>
      )}

      {/* Sector breakdown */}
      {data && data.by_sector.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-white mb-4">By Sector</h2>
          <div className="space-y-3">
            {data.by_sector.map((seg) => (
              <div key={seg.sector}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white">{seg.sector ?? "Unknown"}</span>
                  <span className="text-muted">{fmtUsd(seg.market_value)} · {fmt(seg.allocation_pct)}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent/60 rounded-full"
                    style={{ width: `${Math.min(seg.allocation_pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
