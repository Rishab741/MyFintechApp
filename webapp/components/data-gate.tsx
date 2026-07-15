"use client";

import Link from "next/link";
import { Lock, Upload, Plug } from "lucide-react";
import { usePortfolioStatus } from "@/hooks/use-portfolio-status";

interface DataGateProps {
  children:     React.ReactNode;
  /** One sentence describing what unlocks here — shown on the lock card. */
  description?: string;
}

export function DataGate({ children, description }: DataGateProps) {
  const { hasData, isLoading } = usePortfolioStatus();

  // ── Status check in-flight ────────────────────────────────────────────────
  // Single centred spinner — no skeleton flash, no empty cards
  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 480 }}>
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "rgba(139,92,246,0.4)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  // ── No portfolio data ─────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <div className="flex items-center justify-center px-4" style={{ minHeight: 480 }}>
        <div className="w-full max-w-sm text-center space-y-7">

          {/* Icon */}
          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
            style={{
              background: "rgba(139,92,246,0.07)",
              border:     "1px solid rgba(139,92,246,0.18)",
            }}
          >
            <Lock size={24} className="text-accent opacity-70" />
          </div>

          {/* Copy */}
          <div className="space-y-2.5">
            <h2 className="text-[15px] font-semibold text-white tracking-tight">
              Connect your portfolio to unlock this
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "#6B7280" }}>
              {description ??
                "Import a brokerage export or link an account to see your analytics."}
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard/ingest"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{
                background: "rgba(139,92,246,0.12)",
                border:     "1px solid rgba(139,92,246,0.22)",
                color:      "#A78BFA",
              }}
            >
              <Upload size={14} />
              Import CSV / Excel
            </Link>
            <Link
              href="/dashboard/sync"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{
                background: "rgba(255,255,255,0.04)",
                border:     "1px solid rgba(255,255,255,0.09)",
                color:      "#9CA3AF",
              }}
            >
              <Plug size={14} />
              Connect brokerage
            </Link>
          </div>

          {/* Divider + pipeline option */}
          <p className="text-xs" style={{ color: "#374151" }}>
            or{" "}
            <Link
              href="/dashboard/pipeline"
              className="underline underline-offset-2 transition-opacity hover:opacity-70"
              style={{ color: "#6B7280" }}
            >
              try with sample data
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Data present — render content ─────────────────────────────────────────
  return <>{children}</>;
}
