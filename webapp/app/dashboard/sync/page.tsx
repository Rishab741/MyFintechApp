"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle, CheckCircle2, Loader2, RefreshCw,
  Smartphone, Wifi, WifiOff, Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────
// brokerage_accounts table (migration 20260602000001_brokerage_accounts.sql)
interface BrokerageAccount {
  id:                   string;
  snaptrade_account_id: string | null;
  brokerage_name:       string | null;
  account_name:         string | null;
  last_synced_at:       string | null;
  reconnect_required:   boolean;
}

interface ExchangeConn {
  id:             string;
  exchange:       string;
  label:          string | null;
  is_active:      boolean;
  last_synced_at: string | null;
  sync_error:     string | null;
}

type SyncStatus = "idle" | "syncing" | "done" | "error";

function timeSince(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ExchangeTag({ exchange }: { exchange: string }) {
  const colors: Record<string, string> = {
    binance:    "text-amber-400 border-amber-400/30 bg-amber-400/10",
    binance_us: "text-amber-300 border-amber-300/30 bg-amber-300/10",
    kraken:     "text-purple-400 border-purple-400/30 bg-purple-400/10",
    kucoin:     "text-green-400 border-green-400/30 bg-green-400/10",
  };
  const cls = colors[exchange.toLowerCase()] ?? "text-slate-400 border-slate-400/30 bg-slate-400/10";
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {exchange.toUpperCase()}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SyncPage() {
  const supabase = createClient();

  const [brokerageAccounts, setBrokerageAccounts] = useState<BrokerageAccount[]>([]);
  const [exchanges,         setExchanges]          = useState<ExchangeConn[]>([]);
  const [loading,           setLoading]            = useState(true);
  const [syncStatus,        setSyncStatus]         = useState<Record<string, SyncStatus>>({});
  const [globalSync,        setGlobalSync]         = useState<SyncStatus>("idle");

  // ── Load connections ────────────────────────────────────────────────────────
  async function load() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [brokerRes, exchRes] = await Promise.all([
        // Use brokerage_accounts — the correct table from migration 20260602
        supabase
          .from("brokerage_accounts")
          .select("id, snaptrade_account_id, brokerage_name, account_name, last_synced_at, reconnect_required")
          .eq("user_id", user.id)
          .eq("provider", "snaptrade")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("exchange_connections")
          .select("id, exchange, label, is_active, last_synced_at, sync_error")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
      ]);

      setBrokerageAccounts(brokerRes.data ?? []);
      setExchanges(exchRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── Trigger sync — call Next.js API routes (server-side, no CORS issues) ───
  async function syncSnaptrade() {
    setSyncStatus(s => ({ ...s, snaptrade: "syncing" }));
    try {
      const res = await fetch("/api/sync/snaptrade", { method: "POST" });
      setSyncStatus(s => ({ ...s, snaptrade: res.ok ? "done" : "error" }));
    } catch {
      setSyncStatus(s => ({ ...s, snaptrade: "error" }));
    }
    await load();
  }

  async function syncExchange(id: string) {
    setSyncStatus(s => ({ ...s, [id]: "syncing" }));
    try {
      const res = await fetch("/api/sync/exchange", { method: "POST" });
      setSyncStatus(s => ({ ...s, [id]: res.ok ? "done" : "error" }));
    } catch {
      setSyncStatus(s => ({ ...s, [id]: "error" }));
    }
    await load();
  }

  async function syncAll() {
    setGlobalSync("syncing");
    try {
      const calls: Promise<Response>[] = [];
      if (brokerageAccounts.length) {
        calls.push(fetch("/api/sync/snaptrade", { method: "POST" }));
      }
      if (exchanges.length) {
        calls.push(fetch("/api/sync/exchange", { method: "POST" }));
      }
      await Promise.allSettled(calls);
      setGlobalSync("done");
    } catch {
      setGlobalSync("error");
    }
    await load();
    setTimeout(() => setGlobalSync("idle"), 4000);
  }

  const hasSnaptrade = brokerageAccounts.length > 0;
  const hasAnyConnection = hasSnaptrade || exchanges.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Smartphone size={18} className="text-accent" />
            Mobile Sync
          </h1>
          <p className="text-sm text-muted mt-0.5">
            View and trigger data syncs from your connected mobile accounts
          </p>
        </div>
        {hasAnyConnection && (
          <button
            onClick={syncAll}
            disabled={globalSync === "syncing"}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {globalSync === "syncing" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : globalSync === "done" ? (
              <CheckCircle2 size={14} />
            ) : (
              <RefreshCw size={14} />
            )}
            {globalSync === "syncing" ? "Syncing…" : globalSync === "done" ? "Synced!" : "Sync All"}
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-accent animate-spin" />
        </div>
      )}

      {/* No connections */}
      {!loading && !hasAnyConnection && (
        <div className="bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center py-16 text-center px-8 gap-4">
          <WifiOff size={40} className="text-muted" />
          <div>
            <p className="text-white font-medium">No mobile connections found</p>
            <p className="text-muted text-sm mt-1">
              Open the Platstock mobile app to connect your brokerage or exchange accounts.
              Once connected, they&apos;ll appear here for web-side syncing.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5 mt-2 text-left max-w-sm w-full space-y-2">
            <p className="text-xs text-muted font-medium uppercase tracking-wide">How to connect</p>
            {[
              "Open the Platstock app on your phone",
              "Go to Onboarding → Connect Brokerage",
              "Choose SnapTrade (US brokers) or enter exchange API keys",
              "Return here and click Sync All",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-muted">{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brokerage accounts (SnapTrade) */}
      {!loading && hasSnaptrade && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Wifi size={14} className="text-green-400" />
            <p className="text-sm font-medium text-white">
              Brokerage Accounts via SnapTrade ({brokerageAccounts.length})
            </p>
            <button
              onClick={syncSnaptrade}
              disabled={syncStatus["snaptrade"] === "syncing"}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-white/5 border border-border rounded-lg text-xs text-muted hover:text-white transition-colors disabled:opacity-50"
            >
              {syncStatus["snaptrade"] === "syncing" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : syncStatus["snaptrade"] === "done" ? (
                <CheckCircle2 size={12} className="text-green-400" />
              ) : syncStatus["snaptrade"] === "error" ? (
                <AlertCircle size={12} className="text-red-400" />
              ) : (
                <RefreshCw size={12} />
              )}
              {syncStatus["snaptrade"] === "syncing" ? "Syncing…" :
               syncStatus["snaptrade"] === "done"    ? "Done" :
               syncStatus["snaptrade"] === "error"   ? "Retry" : "Sync All Brokerages"}
            </button>
          </div>
          <div className="divide-y divide-border">
            {brokerageAccounts.map(acc => (
              <div key={acc.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {acc.brokerage_name ?? "Brokerage"}{acc.account_name ? ` · ${acc.account_name}` : ""}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    Last synced: {timeSince(acc.last_synced_at)}
                  </p>
                </div>
                {acc.reconnect_required && (
                  <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full shrink-0">
                    Reconnect needed
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exchange connections */}
      {!loading && exchanges.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Zap size={14} className="text-amber-400" />
            <p className="text-sm font-medium text-white">Exchange API Keys ({exchanges.length})</p>
          </div>
          <div className="divide-y divide-border">
            {exchanges.map(ex => (
              <div key={ex.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <ExchangeTag exchange={ex.exchange} />
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {ex.label ?? ex.exchange}
                    </p>
                    {ex.sync_error ? (
                      <p className="text-xs text-red-400 mt-0.5 truncate">⚠ {ex.sync_error}</p>
                    ) : (
                      <p className="text-xs text-muted mt-0.5">
                        Last synced: {timeSince(ex.last_synced_at)}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => syncExchange(ex.id)}
                  disabled={syncStatus[ex.id] === "syncing"}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-white/5 border border-border rounded-lg text-xs text-muted hover:text-white transition-colors disabled:opacity-50"
                >
                  {syncStatus[ex.id] === "syncing" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : syncStatus[ex.id] === "done" ? (
                    <CheckCircle2 size={12} className="text-green-400" />
                  ) : syncStatus[ex.id] === "error" ? (
                    <AlertCircle size={12} className="text-red-400" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  {syncStatus[ex.id] === "syncing" ? "Syncing…" :
                   syncStatus[ex.id] === "done"    ? "Done" :
                   syncStatus[ex.id] === "error"   ? "Retry" : "Sync"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info card */}
      {hasAnyConnection && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-muted uppercase tracking-wide font-medium mb-3">About Web Sync</p>
          <div className="space-y-2 text-sm text-muted">
            <p>• Syncing pulls your latest holdings and prices into the dashboard — same data the mobile app uses.</p>
            <p>• Exchange API keys are never transmitted to the web browser — syncs are triggered server-side via Supabase Edge Functions.</p>
            <p>• To add or remove connections, use the mobile app. Web-side management is coming soon.</p>
          </div>
        </div>
      )}
    </div>
  );
}
