"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Smartphone, Upload, Zap } from "lucide-react";

const OPTIONS = [
  {
    type:  "snaptrade",
    icon:  Smartphone,
    title: "Brokerage via SnapTrade",
    desc:  "Connect US brokerages (Robinhood, Schwab, Fidelity, IBKR and more) through the Platstock mobile app.",
    tag:   "Recommended",
    color: "#8FF5FF",
  },
  {
    type:  "exchange",
    icon:  Zap,
    title: "Crypto Exchange API",
    desc:  "Binance, Kraken, KuCoin and others via read-only API keys — set up in the mobile app.",
    tag:   null,
    color: "#F59E0B",
  },
  {
    type:  "csv",
    icon:  Upload,
    title: "Upload CSV",
    desc:  "Import holdings or transactions from any custodian using our CSV ingest tool.",
    tag:   null,
    color: "#AC89FF",
  },
] as const;

export default function ConnectPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function choose(type: string | null) {
    setSelected(type ?? "skip");
    setLoading(true);
    try {
      await fetch("/api/onboarding", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "connect", type }),
      });
      // Route based on selection
      if (type === "csv") {
        router.push("/onboarding/complete?next=ingest");
      } else {
        router.push("/onboarding/complete");
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#161b22] border border-white/8 rounded-2xl p-6 text-center">
        <h2 className="text-xl font-semibold text-white">Connect your data</h2>
        <p className="text-slate-400 text-sm mt-2">
          Import your portfolio so the engine has real holdings to work with.
          You can add more sources later from the dashboard.
        </p>
      </div>

      {/* Option cards */}
      {OPTIONS.map((opt) => {
        const Icon      = opt.icon;
        const isActive  = selected === opt.type;
        const isLoading = loading && isActive;
        return (
          <button
            key={opt.type}
            onClick={() => !loading && choose(opt.type)}
            disabled={loading}
            className={`w-full text-left bg-[#161b22] border rounded-2xl p-5 transition-all ${
              isActive
                ? "ring-1"
                : "border-white/8 hover:border-white/20"
            }`}
            style={isActive ? { borderColor: opt.color + "40", boxShadow: `0 0 0 1px ${opt.color}40` } : {}}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                style={{ background: opt.color + "18", border: `1px solid ${opt.color}30` }}
              >
                {isLoading
                  ? <Loader2 size={18} className="animate-spin" style={{ color: opt.color }} />
                  : <Icon size={18} style={{ color: opt.color }} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{opt.title}</p>
                  {opt.tag && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: opt.color + "18", color: opt.color }}
                    >
                      {opt.tag}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{opt.desc}</p>
              </div>
              <ArrowRight size={16} className="text-slate-600 shrink-0 mt-1" />
            </div>
          </button>
        );
      })}

      {/* Skip */}
      <button
        onClick={() => !loading && choose(null)}
        disabled={loading}
        className="w-full py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        {loading && selected === "skip" ? <Loader2 size={14} className="animate-spin inline mr-2" /> : null}
        Skip for now — I'll connect data later
      </button>
    </div>
  );
}
