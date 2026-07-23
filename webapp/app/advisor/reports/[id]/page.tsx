"use client";

/**
 * /advisor/reports/[id] — saved report viewer.
 * Renders the persisted diagnostic through the same <DiagnosticReport>
 * component as a live run — one visual source of truth.
 *
 * Also owns the "Share with client" panel — creating/revoking the public
 * /share/[token] link. That link is the ONLY thing a prospect ever sees;
 * this authenticated page (with its Prospect/Compliance toggle) never
 * leaves the advisor's own login.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Printer, Link2, Copy, Check, Ban, Eye } from "lucide-react";
import {
  Diagnostic,
  GOLD, GOLD_DIM, MUTED, RED, GREEN,
} from "@/components/advisor/diagnostic-report";
import { SlideDeck, ModeOptionCards, ReportMode } from "@/components/advisor/report-slides";

interface SavedReport {
  id:                   string;
  client_label:         string;
  created_at:           string;
  diagnostic:           Diagnostic;
  share_token:          string | null;
  share_expires_at:     string | null;
  share_revoked_at:     string | null;
  share_view_count:     number;
  share_last_viewed_at: string | null;
}

const EXPIRY_OPTIONS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "Never",   days: null as number | null },
];

function isShareActive(r: SavedReport): boolean {
  if (!r.share_token || r.share_revoked_at) return false;
  if (r.share_expires_at && new Date(r.share_expires_at) <= new Date()) return false;
  return true;
}

// ── Share panel ────────────────────────────────────────────────────────────────

function SharePanel({
  report, onChange,
}: {
  report: SavedReport;
  onChange: (patch: Partial<SavedReport>) => void;
}) {
  const [busy, setBusy]     = useState(false);
  const [copied, setCopied] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number | null>(90);

  const active = isShareActive(report);
  const url = report.share_token && typeof window !== "undefined"
    ? `${window.location.origin}/share/${report.share_token}`
    : "";

  async function create() {
    setBusy(true);
    try {
      const res = await fetch(`/api/advisor/reports/${report.id}/share`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ expiresInDays: expiryDays }),
      });
      const json = await res.json();
      if (res.ok) {
        onChange({
          share_token: json.token, share_expires_at: json.expires_at,
          share_revoked_at: null, share_view_count: json.view_count ?? 0,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm("Revoke this share link? The prospect will no longer be able to open it.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/advisor/reports/${report.id}/share`, { method: "DELETE" });
      if (res.ok) onChange({ share_revoked_at: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="rounded-2xl p-5 print:hidden"
      style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}18` }}>
          <Link2 size={13} style={{ color: GOLD }} />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Share with client</p>
          <p className="text-[11px]" style={{ color: MUTED }}>
            A public, read-only link showing the client presentation view only — no login required, no compliance detail.
          </p>
        </div>
      </div>

      {active ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
            style={{ background: "#0D0D14", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="flex-1 text-xs font-mono truncate" style={{ color: "rgba(255,255,255,0.85)" }}>
              {url}
            </span>
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono shrink-0 transition-all"
              style={{ background: copied ? `${GREEN}18` : GOLD_DIM, color: copied ? GREEN : GOLD }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono" style={{ color: MUTED }}>
            <span className="flex items-center gap-1.5">
              <Eye size={12} />
              {report.share_view_count} view{report.share_view_count === 1 ? "" : "s"}
              {report.share_last_viewed_at && (
                <> · last opened {new Date(report.share_last_viewed_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}</>
              )}
            </span>
            <span>
              {report.share_expires_at
                ? `Expires ${new Date(report.share_expires_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}`
                : "No expiry"}
            </span>
          </div>

          <button
            onClick={revoke}
            disabled={busy}
            className="flex items-center gap-1.5 text-[11px] font-mono transition-colors disabled:opacity-50"
            style={{ color: RED }}
          >
            <Ban size={12} />
            Revoke link
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1.5">
            {EXPIRY_OPTIONS.map(opt => (
              <button
                key={opt.label}
                onClick={() => setExpiryDays(opt.days)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition-all"
                style={{
                  background: expiryDays === opt.days ? GOLD_DIM : "rgba(255,255,255,0.03)",
                  border: `1px solid ${expiryDays === opt.days ? `${GOLD}40` : "rgba(255,255,255,0.08)"}`,
                  color: expiryDays === opt.days ? GOLD : MUTED,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={create}
            disabled={busy}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold transition-all disabled:opacity-50"
            style={{ background: GOLD_DIM, border: `1px solid ${GOLD}40`, color: GOLD }}
          >
            <Link2 size={12} />
            {busy ? "Creating…" : "Create share link"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SavedReportPage() {
  const params   = useParams<{ id: string }>();
  const supabase = createClient();

  const [report,  setReport]  = useState<SavedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [reportMode, setReportMode] = useState<ReportMode>("prospect");

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from("advisor_reports")
        .select("id, client_label, created_at, diagnostic, share_token, share_expires_at, share_revoked_at, share_view_count, share_last_viewed_at")
        .eq("id", params.id)
        .maybeSingle();
      if (err || !data) {
        setError("Report not found — it may have been deleted, or belongs to another firm.");
      } else {
        setReport(data as SavedReport);
      }
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: `${GOLD}66`, borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-4">
        <p className="text-sm" style={{ color: RED }}>{error}</p>
        <Link href="/advisor/reports" className="text-sm underline underline-offset-2" style={{ color: GOLD }}>
          ← Back to report library
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href="/advisor/reports"
          className="flex items-center gap-1.5 text-xs font-mono tracking-widest transition-colors hover:text-white"
          style={{ color: MUTED }}
        >
          <ArrowLeft size={13} />
          REPORT LIBRARY
        </Link>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <span className="text-[11px] font-mono hidden md:block" style={{ color: MUTED }}>
            Saved {new Date(report.created_at).toLocaleString("en-AU", {
              day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono tracking-widest transition-all"
            style={{ background: GOLD_DIM, border: `1px solid ${GOLD}40`, color: GOLD }}
          >
            <Printer size={13} />
            PRINT / SAVE PDF
          </button>
        </div>
      </div>

      {/* ── Share panel ── */}
      <SharePanel report={report} onChange={patch => setReport(r => r ? { ...r, ...patch } : r)} />

      {/* ── Report type ── */}
      <div className="print:hidden">
        <p className="text-[11px] font-mono tracking-widest uppercase mb-2" style={{ color: MUTED }}>
          Choose report type
        </p>
        <ModeOptionCards mode={reportMode} onChange={setReportMode} />
      </div>

      {/* ── The report ── */}
      <SlideDeck d={report.diagnostic} mode={reportMode} firmName={report.diagnostic.firm_name} />

      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          body { background: #fff !important; color: #111 !important; }
          #report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden, header, nav { display: none !important; }
          #report { display: block !important; }
        }
      `}</style>
    </div>
  );
}
