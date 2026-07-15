"use client";

/**
 * /admin — platform observer panel.
 *
 * Read-only by construction: the admin role has SELECT-only RLS policies
 * (see 20260716000001_admin_role.sql). This page issues no mutations, and
 * any mutation attempted with an admin JWT is rejected by Postgres itself.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Building2, Eye, FileText, LogOut, RefreshCw, ShieldCheck, Users,
} from "lucide-react";

// Steel-blue accent — visually distinct from retail purple and advisor gold.
const A        = "#7BA3C9";
const A_BG     = "rgba(123,163,201,0.08)";
const A_BORDER = "rgba(123,163,201,0.2)";
const CARD_BG  = "#111118";
const CARD_BD  = "#1A1A28";

interface Firm {
  id:                   string;
  email:                string;
  firm_name:            string;
  firm_type:            string | null;
  aum_range:            string | null;
  team_size:            string | null;
  plan_tier:            string;
  reports_this_month:   number;
  report_limit_monthly: number;
  created_at:           string;
}

interface AuditRow {
  id:         string;
  firm_id:    string | null;
  event:      string;
  ip_address: string | null;
  created_at: string;
  metadata:   Record<string, unknown>;
}

const TIER_COLOR: Record<string, string> = {
  free: "#6B7280", starter: "#C9A84C", pro: "#8B5CF6", enterprise: "#10B981",
};

const AUM_LABEL: Record<string, string> = {
  under_50m: "<$50M", "50m_250m": "$50M–250M", "250m_1b": "$250M–1B", over_1b: ">$1B",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminPanel() {
  const supabase = createClient();
  const [firms,   setFirms]   = useState<Firm[]>([]);
  const [audit,   setAudit]   = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email,   setEmail]   = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: f }, { data: a }, { data: { user } }] = await Promise.all([
      supabase
        .from("advisor_firms")
        .select("id, email, firm_name, firm_type, aum_range, team_size, plan_tier, reports_this_month, report_limit_monthly, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("advisor_audit_log")
        .select("id, firm_id, event, ip_address, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.auth.getUser(),
    ]);
    setFirms((f as Firm[]) ?? []);
    setAudit((a as AuditRow[]) ?? []);
    setEmail(user?.email ?? null);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const totalReports = firms.reduce((s, f) => s + f.reports_this_month, 0);

  return (
    <div className="min-h-screen bg-[#09090E] text-white">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{ background: "rgba(9,9,14,0.92)", backdropFilter: "blur(12px)", borderColor: CARD_BD }}
      >
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}>
              <Eye size={13} style={{ color: A }} />
            </div>
            <span className="font-semibold text-sm">
              Platstock <span style={{ color: A }}>Admin</span>
            </span>
            <span
              className="ml-2 px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-widest"
              style={{ background: A_BG, color: A, border: `1px solid ${A_BORDER}` }}
            >
              Observer · read-only
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#4B5563] hidden sm:block">{email}</span>
            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-white transition-colors"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-xs text-[#EF4444] hover:opacity-80 transition-opacity"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ── Read-only notice ──────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: A_BG, border: `1px solid ${A_BORDER}`, color: A }}
        >
          <ShieldCheck size={15} className="shrink-0" />
          Observer mode — this account has SELECT-only database policies.
          Writes are rejected by Postgres regardless of what the UI attempts.
        </div>

        {/* ── Stat cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Advisor firms",       value: firms.length,  icon: Building2 },
            { label: "Reports this month",  value: totalReports,  icon: FileText },
            { label: "Audit events (50 latest)", value: audit.length, icon: Users },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl p-5 flex flex-col gap-3"
              style={{ background: CARD_BG, border: `1px solid ${CARD_BD}` }}>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">{label}</p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: A_BG }}>
                  <Icon size={13} style={{ color: A }} />
                </div>
              </div>
              <p className="text-[28px] font-bold leading-none">
                {loading ? "—" : value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Firms table ───────────────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ background: CARD_BG, border: `1px solid ${CARD_BD}` }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: CARD_BD }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
              Advisor firms
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-[#4B5563]">
                  {["Firm", "Email", "Type", "AUM", "Tier", "Reports", "Joined"].map(h => (
                    <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-[#4B5563]">Loading…</td></tr>
                ) : firms.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-[#4B5563]">No advisor firms yet.</td></tr>
                ) : firms.map(f => (
                  <tr key={f.id} className="border-t hover:bg-white/[0.02] transition-colors"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    <td className="px-5 py-3 font-medium whitespace-nowrap">{f.firm_name}</td>
                    <td className="px-5 py-3 text-[#6B7280] whitespace-nowrap">{f.email}</td>
                    <td className="px-5 py-3 text-[#9CA3AF] uppercase text-xs">{f.firm_type ?? "—"}</td>
                    <td className="px-5 py-3 text-[#9CA3AF] text-xs whitespace-nowrap">
                      {f.aum_range ? (AUM_LABEL[f.aum_range] ?? f.aum_range) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
                        style={{
                          color:      TIER_COLOR[f.plan_tier] ?? "#6B7280",
                          background: `${TIER_COLOR[f.plan_tier] ?? "#6B7280"}18`,
                        }}>
                        {f.plan_tier}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#9CA3AF] whitespace-nowrap tabular-nums">
                      {f.reports_this_month} / {f.report_limit_monthly}
                    </td>
                    <td className="px-5 py-3 text-[#4B5563] text-xs whitespace-nowrap">
                      {fmtDate(f.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Audit log ─────────────────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ background: CARD_BG, border: `1px solid ${CARD_BD}` }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: CARD_BD }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
              Recent auth events
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-[#4B5563]">
                  {["Event", "Firm / detail", "IP", "When"].map(h => (
                    <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-[#4B5563]">Loading…</td></tr>
                ) : audit.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-[#4B5563]">No events yet.</td></tr>
                ) : audit.map(a => (
                  <tr key={a.id} className="border-t"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
                        style={{
                          color:      a.event.includes("FAILED") ? "#EF4444" : A,
                          background: a.event.includes("FAILED") ? "rgba(239,68,68,0.1)" : A_BG,
                        }}>
                        {a.event}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#6B7280] text-xs max-w-[280px] truncate">
                      {String(a.metadata?.firm_name ?? a.metadata?.email ?? a.firm_id ?? "—")}
                    </td>
                    <td className="px-5 py-3 text-[#4B5563] text-xs font-mono">{a.ip_address ?? "—"}</td>
                    <td className="px-5 py-3 text-[#4B5563] text-xs whitespace-nowrap">{fmtDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-[#374151] pb-6">
          Panels: this observer view · <a href="/dashboard" className="underline hover:text-[#6B7280]">retail dashboard</a> ·{" "}
          <a href="/advisor/dashboard" className="underline hover:text-[#6B7280]">advisor portal</a> — all navigable, none writable.
        </p>
      </div>
    </div>
  );
}
