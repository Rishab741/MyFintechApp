"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { engine } from "@/lib/engine";
import { Zap, Activity, RefreshCw } from "lucide-react";
import MetricCard from "@/components/ui/metric-card";

async function getJwt() {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? "";
}

export default function UsagePage() {
  const { data, isLoading } = useSWR("usage", async () => {
    const jwt = await getJwt();
    return engine.tenant.usage(jwt);
  });

  const pctUsed =
    data?.daily_limit && data.daily_limit > 0
      ? Math.min((data.api_calls / data.daily_limit) * 100, 100)
      : null;

  const month = data?.month
    ? new Date(data.month).toLocaleString("default", { month: "long", year: "numeric" })
    : "—";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Usage</h1>
          <p className="text-sm text-muted mt-0.5">{month} · <span className="capitalize">{data?.tier ?? "—"}</span> tier</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="API Calls"    value={data?.api_calls    ?? null} icon={Zap}        loading={isLoading} sub={data?.daily_limit ? `${data.daily_limit.toLocaleString()} daily limit` : "Unlimited"} />
        <MetricCard label="Compute Runs" value={data?.compute_runs ?? null} icon={Activity}   loading={isLoading} />
        <MetricCard label="Price Syncs"  value={data?.price_syncs  ?? null} icon={RefreshCw}  loading={isLoading} />
      </div>

      {/* Usage bar */}
      {pctUsed !== null && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex justify-between text-sm mb-3">
            <span className="text-muted">Daily API calls</span>
            <span className="text-white font-medium">
              {data?.api_calls?.toLocaleString()} / {data?.daily_limit?.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-surface rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pctUsed > 90 ? "bg-negative" : pctUsed > 70 ? "bg-warning" : "bg-positive"
              }`}
              style={{ width: `${pctUsed}%` }}
            />
          </div>
          <p className="text-xs text-muted mt-2">{pctUsed.toFixed(1)}% of daily limit used</p>
        </div>
      )}

      {/* Upgrade nudge */}
      {data?.tier === "self_serve" && (
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-5">
          <h3 className="font-medium text-white mb-1">Upgrade to Starter</h3>
          <p className="text-sm text-muted">
            Self-serve is capped at 500 API calls/day. Starter gives you 5,000 calls/day,
            portfolio webhooks, and priority support.
          </p>
        </div>
      )}
    </div>
  );
}
