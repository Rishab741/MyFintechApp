"use client";

import { useState } from "react";
import useSWR from "swr";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import { Shield, CheckCircle2, AlertTriangle, RefreshCw, Wrench, Lock } from "lucide-react";

export default function LedgerPage() {
  const { data, isLoading, mutate } = useSWR("ledger", async () => {
    return engine.ledger.verify(await getJwt());
  }, { revalidateOnFocus: false });

  const [repairState, setRepairState] = useState<"idle" | "running" | "done">("idle");
  const [repairMsg,   setRepairMsg]   = useState("");

  const chainOk = data?.chain_ok ?? true;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-white">Ledger Integrity</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            SHA-256 hash-chained ledger — tamper-evident by design
          </p>
        </div>
        <div className="flex gap-2">
          {data && !data.chain_ok && (
            <button
              onClick={async () => {
                setRepairState("running");
                setRepairMsg("");
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
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.25)",
                color: "#F59E0B",
              }}
            >
              {repairState === "running"
                ? <div className="w-3.5 h-3.5 rounded-full border-2 border-[#F59E0B] border-t-transparent animate-spin" />
                : <Wrench size={13} />}
              {repairState === "running" ? "Repairing…" : "Repair chain"}
            </button>
          )}
          <button
            onClick={() => mutate()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
            style={{ background: "#111118", border: "1px solid #1A1A28", color: "#6B7280" }}
          >
            <RefreshCw size={13} />
            Re-verify
          </button>
        </div>
      </div>

      {/* Status card */}
      {isLoading ? (
        <div className="rounded-xl p-8 animate-pulse" style={{ background: "#111118", border: "1px solid #1A1A28" }}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/5" />
            <div className="space-y-2">
              <div className="h-5 w-36 bg-white/5 rounded" />
              <div className="h-3 w-56 bg-white/5 rounded" />
            </div>
          </div>
        </div>
      ) : data && (
        <div
          className="rounded-xl p-6 flex items-start gap-5"
          style={
            chainOk
              ? { background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.2)" }
              : { background: "rgba(239,68,68,0.04)",  border: "1px solid rgba(239,68,68,0.2)"  }
          }
        >
          <div
            className="flex items-center justify-center w-14 h-14 rounded-xl shrink-0"
            style={
              chainOk
                ? { background: "rgba(16,185,129,0.1)" }
                : { background: "rgba(239,68,68,0.1)"  }
            }
          >
            {chainOk
              ? <CheckCircle2 size={28} style={{ color: "#10B981" }} />
              : <AlertTriangle size={28} style={{ color: "#EF4444" }} />}
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: chainOk ? "#10B981" : "#EF4444" }}>
              {chainOk ? "Chain intact" : "Chain broken"}
            </h2>
            <p className="text-sm text-[#6B7280] mt-1">
              {chainOk
                ? `${data.tx_count.toLocaleString()} transactions verified — no tampering detected`
                : `${data.broken_links.length} broken link(s) found in the hash chain`}
            </p>
            <p className="text-xs text-[#4B5563] mt-2">
              Verified at {new Date(data.verified_at).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Repair result */}
      {repairMsg && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
          style={
            repairState === "done"
              ? { background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981" }
              : { background: "rgba(239,68,68,0.08)",  border: "1px solid rgba(239,68,68,0.2)",  color: "#EF4444"  }
          }
        >
          {repairState === "done" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {repairMsg}
        </div>
      )}

      {/* Stats grid */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Transactions",
              value: data.tx_count.toLocaleString(),
              color: "text-white",
            },
            {
              label: "Broken links",
              value: chainOk ? "0" : String(data.broken_links.length),
              color: chainOk ? "text-[#10B981]" : "text-[#EF4444]",
            },
            {
              label: "Algorithm",
              value: "SHA-256",
              color: "text-accent",
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-xl p-5 text-center"
              style={{ background: "#111118", border: "1px solid #1A1A28" }}
            >
              <p className={`text-[22px] font-bold ${color}`}>{value}</p>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563] mt-1.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Broken link details */}
      {data?.broken_links && data.broken_links.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "#111118", border: "1px solid rgba(239,68,68,0.2)" }}>
          <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(239,68,68,0.15)" }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} style={{ color: "#EF4444" }} />
              <h3 className="text-sm font-semibold text-white">Broken Links</h3>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "#1A1A28" }}>
            {data.broken_links.map((link) => (
              <div key={link.tx_id} className="px-5 py-4">
                <p className="font-mono text-xs text-[#6B7280] mb-1.5">{link.tx_id}</p>
                <p className="text-sm font-medium" style={{ color: "#EF4444" }}>{link.issue}</p>
                <p className="text-xs text-[#4B5563] mt-1">
                  {new Date(link.settled_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl p-5" style={{ background: "#111118", border: "1px solid #1A1A28" }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/8">
            <Lock size={13} className="text-accent" />
          </div>
          <h3 className="text-sm font-semibold text-white">How it works</h3>
        </div>
        <ol className="space-y-3">
          {[
            "Each transaction stores a SHA-256 hash of (prev_hash + id + amount + date + user).",
            "Any modification to a transaction breaks the chain — detectable on every verification.",
            "Merkle checkpoints are written every 1,000 transactions for O(1) spot-verification.",
            "The SQL trigger seals row_hash on INSERT — the application layer cannot forge it.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="text-accent font-mono text-xs mt-0.5 shrink-0 w-4 tabular-nums">{i + 1}.</span>
              <span className="text-[#6B7280] leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
