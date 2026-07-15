"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowUpRight, BarChart2, Building2, FileText,
  Sparkles, Upload, Clock, Shield,
} from "lucide-react";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const A        = "#C9A84C";
const A_BG     = "rgba(201,168,76,0.08)";
const A_BORDER = "rgba(201,168,76,0.18)";
const CARD_BG  = "#111118";
const CARD_BD  = "#1A1A28";

interface Firm {
  id:                   string;
  firm_name:            string;
  plan_tier:            string;
  reports_this_month:   number;
  report_limit_monthly: number;
  created_at:           string;
}

const TIER_LABEL: Record<string, string> = {
  free:       "Free",
  starter:    "Starter",
  pro:        "Pro",
  enterprise: "Enterprise",
};

const TIER_COLOR: Record<string, string> = {
  free:       "#6B7280",
  starter:    A,
  pro:        "#8B5CF6",
  enterprise: "#10B981",
};

export default function AdvisorDashboard() {
  const supabase = createClient();
  const [firm,    setFirm]    = useState<Firm | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("advisor_firms")
        .select("id, firm_name, plan_tier, reports_this_month, report_limit_monthly, created_at")
        .eq("user_id", user.id)
        .single();

      setFirm(data ?? null);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const reportsUsed  = firm?.reports_this_month  ?? 0;
  const reportsLimit = firm?.report_limit_monthly ?? 5;
  const reportsLeft  = Math.max(0, reportsLimit - reportsUsed);
  const usagePct     = reportsLimit > 0 ? Math.min((reportsUsed / reportsLimit) * 100, 100) : 0;
  const tier         = firm?.plan_tier ?? "free";
  const tierLabel    = TIER_LABEL[tier]  ?? tier;
  const tierColor    = TIER_COLOR[tier]  ?? "#6B7280";

  function Skeleton({ className = "" }: { className?: string }) {
    return <div className={`bg-white/5 rounded animate-pulse ${className}`} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {loading
            ? <Skeleton className="h-7 w-48 mb-2" />
            : <h1 className="text-[22px] font-semibold text-white leading-tight">
                {firm?.firm_name ?? "Your firm"}
              </h1>
          }
          <div className="flex items-center gap-2 mt-1">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-widest"
              style={{ background: `${tierColor}18`, color: tierColor, border: `1px solid ${tierColor}30` }}
            >
              {tierLabel}
            </span>
            <span className="text-[#4B5563] text-xs">Advisor Portal</span>
          </div>
        </div>
        <Link
          href="/advisor/diagnose"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shrink-0 transition-all hover:opacity-90"
          style={{
            background: A,
            color:      "#0A0A0F",
            boxShadow:  "0 0 16px rgba(201,168,76,0.18)",
          }}
        >
          <Upload size={14} />
          Run diagnostic
        </Link>
      </div>

      {/* ── Usage card ────────────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-6 space-y-4"
        style={{ background: CARD_BG, border: `1px solid ${CARD_BD}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
            >
              <BarChart2 size={13} style={{ color: A }} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
              Monthly reports
            </p>
          </div>
          <p className="text-sm font-medium text-white">
            {loading ? "—" : `${reportsUsed} / ${reportsLimit}`}
          </p>
        </div>

        {/* Progress bar */}
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width:      `${usagePct}%`,
              background: usagePct > 90 ? "#EF4444" : usagePct > 70 ? "#F59E0B" : A,
            }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-[#6B7280]">
          <span>
            {loading ? "—" : `${reportsLeft} report${reportsLeft !== 1 ? "s" : ""} remaining this month`}
          </span>
          {tier === "free" && !loading && (
            <Link
              href="mailto:rishash851@gmail.com?subject=Platstock%20Advisor%20Upgrade"
              className="flex items-center gap-1 font-medium hover:underline"
              style={{ color: A }}
            >
              Upgrade plan <ArrowUpRight size={11} />
            </Link>
          )}
        </div>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563] mb-3">
          Quick actions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              href:  "/advisor/diagnose",
              icon:  Upload,
              title: "New diagnostic",
              desc:  "Upload a client CSV and generate a behavioral audit",
              accent: true,
            },
            {
              href:  "/advisor/reports",
              icon:  FileText,
              title: "Report history",
              desc:  "View and re-open previous client diagnostics",
              accent: false,
              badge: "Coming soon",
            },
            {
              href:  "/advisor/settings",
              icon:  Building2,
              title: "Firm settings",
              desc:  "Update name, logo, and branding for white-label PDFs",
              accent: false,
              badge: "Coming soon",
            },
          ].map(({ href, icon: Icon, title, desc, accent, badge }) => (
            <Link
              key={href}
              href={badge ? "#" : href}
              onClick={badge ? (e: React.MouseEvent) => e.preventDefault() : undefined}
              className={`group relative rounded-xl p-5 flex flex-col gap-3 transition-all ${
                accent ? "hover:opacity-90" : "hover:border-[#2A2A3E]"
              } ${badge ? "cursor-default opacity-60" : ""}`}
              style={{
                background: accent ? A_BG : CARD_BG,
                border:     `1px solid ${accent ? A_BORDER : CARD_BD}`,
              }}
            >
              {badge && (
                <span
                  className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#6B7280" }}
                >
                  {badge}
                </span>
              )}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: accent ? `${A}22` : "rgba(255,255,255,0.04)",
                  border:     `1px solid ${accent ? A_BORDER : "rgba(255,255,255,0.07)"}`,
                }}
              >
                <Icon size={15} style={{ color: accent ? A : "#6B7280" }} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">{desc}</p>
              </div>
              {!badge && (
                <ArrowUpRight
                  size={13}
                  className="absolute top-4 right-4 text-[#374151] group-hover:text-[#6B7280] transition-colors"
                />
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* ── What's included ───────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-6"
        style={{ background: CARD_BG, border: `1px solid ${CARD_BD}` }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} style={{ color: A }} />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
            What the diagnostic covers
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            ["Behavioral Tax",      "Performance gap vs. buy-and-hold baseline"],
            ["Panic Liquidation",   "Sells triggered during ≥10% drawdown events"],
            ["Entry Timing Score",  "Buy clustering vs. volatility peaks/troughs"],
            ["Loss Aversion Index", "Asymmetric hold time: losers vs. winners"],
            ["Trade Win Rate",      "Completed profitable pairs as a percentage"],
            ["Wealth Path Chart",   "Capital deployed vs. proceeds received over time"],
          ].map(([title, desc]) => (
            <div key={title} className="flex items-start gap-2.5">
              <div
                className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                style={{ background: A }}
              />
              <div>
                <p className="text-sm text-white font-medium">{title}</p>
                <p className="text-xs text-[#6B7280] mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer security note ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-[#374151]">
        <Shield size={11} />
        All uploaded CSVs are processed in-memory and never stored. Zero client data persisted.
        <span className="mx-1">·</span>
        <Clock size={11} />
        {loading || !firm ? "—" : `Member since ${new Date(firm.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`}
      </div>
    </div>
  );
}
