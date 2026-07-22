"use client";

/**
 * /share/[token] — the client-facing surface.
 *
 * Deliberately NOT under /advisor — no advisor nav, no auth, no login wall.
 * This page has no ReportModeToggle import and never will: there is no code
 * path here that can render a compliance view, because the data it fetches
 * (prospect_snapshot, via /api/share/[token]) never contains risk_suite,
 * behavioral_v2, tax_analysis, statistics, or score subscores in the first
 * place. Separation isn't a UI mode check here — the data simply isn't present.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer, ShieldOff, Clock } from "lucide-react";
import { Diagnostic, DiagnosticReport, GOLD, GOLD_DIM, MUTED } from "@/components/advisor/diagnostic-report";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; diagnostic: Diagnostic }
  | { kind: "revoked" }
  | { kind: "expired" }
  | { kind: "not_found" };

export default function SharedReportPage() {
  const params = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/share/${params.token}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json.diagnostic) {
          setState({ kind: "ready", diagnostic: json.diagnostic as Diagnostic });
        } else if (res.status === 410 && json.error === "revoked") {
          setState({ kind: "revoked" });
        } else if (res.status === 410 && json.error === "expired") {
          setState({ kind: "expired" });
        } else {
          setState({ kind: "not_found" });
        }
      } catch {
        if (!cancelled) setState({ kind: "not_found" });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [params.token]);

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: `${GOLD}66`, borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (state.kind !== "ready") {
    const copy = {
      revoked:   { icon: ShieldOff, title: "This link has been revoked", body: "Your advisor has disabled access to this report. Contact them directly for an updated copy." },
      expired:   { icon: Clock,     title: "This link has expired",       body: "Ask your advisor to send a fresh link — reports can be re-shared at any time." },
      not_found: { icon: ShieldOff, title: "Report not found",            body: "This link is invalid or the report is no longer available." },
    }[state.kind];
    const Icon = copy.icon;
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <Icon size={22} style={{ color: MUTED }} />
          </div>
          <h1 className="text-base font-bold text-white">{copy.title}</h1>
          <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{copy.body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      <div className="flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono tracking-widest transition-all"
          style={{ background: GOLD_DIM, border: `1px solid ${GOLD}40`, color: GOLD }}
        >
          <Printer size={13} />
          PRINT / SAVE PDF
        </button>
      </div>

      <DiagnosticReport d={state.diagnostic} mode="prospect" />

      <style>{`
        @media print {
          body { background: #fff !important; color: #111 !important; }
          #report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          #report { display: block !important; }
        }
      `}</style>
    </div>
  );
}
