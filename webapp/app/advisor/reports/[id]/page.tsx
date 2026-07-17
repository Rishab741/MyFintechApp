"use client";

/**
 * /advisor/reports/[id] — saved report viewer.
 * Renders the persisted diagnostic through the same <DiagnosticReport>
 * component as a live run — one visual source of truth.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Printer } from "lucide-react";
import {
  Diagnostic, DiagnosticReport, GOLD, GOLD_DIM, MUTED, RED,
} from "@/components/advisor/diagnostic-report";

interface SavedReport {
  id:           string;
  client_label: string;
  created_at:   string;
  diagnostic:   Diagnostic;
}

export default function SavedReportPage() {
  const params   = useParams<{ id: string }>();
  const supabase = createClient();

  const [report,  setReport]  = useState<SavedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from("advisor_reports")
        .select("id, client_label, created_at, diagnostic")
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
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono hidden sm:block" style={{ color: MUTED }}>
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

      {/* ── The report ── */}
      <DiagnosticReport d={report.diagnostic} />

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
