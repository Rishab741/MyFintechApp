"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import { Shield, CheckCircle, AlertTriangle, RefreshCw, Wrench } from "lucide-react";



export default function LedgerPage() {
  const { data, isLoading, mutate } = useSWR("ledger", async () => {
    const jwt = await getJwt();
    return engine.ledger.verify(jwt);
  }, { revalidateOnFocus: false });

  const [repairState, setRepairState] = useState<"idle" | "running" | "done">("idle");
  const [repairMsg,   setRepairMsg]   = useState("");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Ledger Integrity</h1>
          <p className="text-sm text-muted mt-0.5">
            SHA-256 hash-chained transaction ledger — tamper-evident by design.
          </p>
        </div>
        <div className="flex gap-2">
          {data && !data.chain_ok && (
            <button
              onClick={async () => {
                setRepairState("running"); setRepairMsg("");
                try {
                  const jwt = await getJwt();
                  const res = await engine.ledger.repair(jwt);
                  setRepairMsg(`Re-sealed ${res.resealed} transactions`);
                  setRepairState("done");
                  mutate();
                } catch (e: any) {
                  setRepairMsg(e.message ?? "Repair failed");
                  setRepairState("idle");
                }
              }}
              disabled={repairState === "running"}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-warning/40 text-warning hover:bg-warning/10 text-sm transition-colors disabled:opacity-50"
            >
              {repairState === "running"
                ? <div className="w-3.5 h-3.5 rounded-full border-2 border-warning border-t-transparent animate-spin" />
                : <Wrench size={14} />}
              {repairState === "running" ? "Repairing…" : "Repair chain"}
            </button>
          )}
          <button
            onClick={() => mutate()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted hover:text-white text-sm transition-colors"
          >
            <RefreshCw size={14} />
            Re-verify
          </button>
        </div>
      </div>

      {/* Status card */}
      <div className={`rounded-xl border p-6 ${
        isLoading              ? "border-border bg-card"
        : data?.chain_ok       ? "border-positive/30 bg-positive/5"
        : "border-negative/30 bg-negative/5"
      }`}>
        {isLoading ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/5 animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
              <div className="h-3 w-48 bg-white/5 rounded animate-pulse" />
            </div>
          </div>
        ) : data ? (
          <div className="flex items-start gap-4">
            {data.chain_ok
              ? <CheckCircle size={36} className="text-positive shrink-0" />
              : <AlertTriangle size={36} className="text-negative shrink-0" />
            }
            <div>
              <h2 className={`text-lg font-semibold ${data.chain_ok ? "text-positive" : "text-negative"}`}>
                {data.chain_ok ? "Chain intact" : "Chain broken"}
              </h2>
              <p className="text-sm text-muted mt-0.5">
                {data.chain_ok
                  ? `${data.tx_count.toLocaleString()} transactions verified — no tampering detected`
                  : `${data.broken_links.length} broken link(s) found in the transaction chain`}
              </p>
              <p className="text-xs text-muted mt-2">
                Verified at {new Date(data.verified_at).toLocaleString()}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Repair result */}
      {repairMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${
          repairState === "done"
            ? "bg-positive/10 border-positive/20 text-positive"
            : "bg-negative/10 border-negative/20 text-negative"
        }`}>
          {repairState === "done" ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
          {repairMsg}
        </div>
      )}

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-semibold text-white">{data.tx_count.toLocaleString()}</p>
            <p className="text-xs text-muted mt-1">Transactions</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-semibold text-positive">{data.chain_ok ? "0" : data.broken_links.length}</p>
            <p className="text-xs text-muted mt-1">Broken links</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <Shield size={20} className="mx-auto text-accent mb-1" />
            <p className="text-xs text-muted">SHA-256</p>
          </div>
        </div>
      )}

      {/* Broken link details */}
      {data?.broken_links && data.broken_links.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-medium text-white text-sm">Broken Links</h3>
          </div>
          <div className="divide-y divide-border">
            {data.broken_links.map((link) => (
              <div key={link.tx_id} className="px-4 py-3 text-sm">
                <p className="font-mono text-xs text-muted mb-1">{link.tx_id}</p>
                <p className="text-negative text-xs">{link.issue}</p>
                <p className="text-muted text-xs mt-0.5">{new Date(link.settled_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-medium text-white mb-3 text-sm">How it works</h3>
        <ol className="space-y-2 text-sm text-muted list-none">
          {[
            "Each transaction stores a SHA-256 hash of (prev_hash + id + amount + date + user).",
            "Any modification to a transaction breaks the chain — detectable instantly.",
            "Merkle checkpoints are written every 1,000 transactions for O(1) verification.",
            "The SQL trigger seals row_hash on INSERT — the application cannot forge it.",
          ].map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="text-accent font-mono text-xs mt-0.5 shrink-0">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
