"use client";

/**
 * /advisor/reports — the firm's report library.
 * List reads come straight through RLS (own-firm rows only); the denormalized
 * columns mean this page never parses diagnostic JSONB.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FileText, Search, Trash2, Upload } from "lucide-react";
import { GOLD, GOLD_DIM, GRADE_COLOR, GREEN, MUTED, RED, fmtMoney } from "@/components/advisor/diagnostic-report";

interface ReportRow {
  id:                string;
  client_label:      string;
  broker:            string | null;
  currency:          string;
  overall_grade:     string | null;
  composite_score:   number | null;
  opportunity_cost:  number | null;
  transaction_count: number | null;
  period_start:      string | null;
  period_end:        string | null;
  created_at:        string;
}

export default function AdvisorReportsPage() {
  const supabase = createClient();
  const [rows,    setRows]    = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("advisor_reports")
      .select("id, client_label, broker, currency, overall_grade, composite_score, opportunity_cost, transaction_count, period_start, period_end, created_at")
      .order("created_at", { ascending: false });
    setRows((data as ReportRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete the report for "${label}"? This cannot be undone.`)) return;
    setDeleting(id);
    await supabase.from("advisor_reports").delete().eq("id", id);
    setDeleting(null);
    void load();
  }

  const filtered = query.trim()
    ? rows.filter(r => r.client_label.toLowerCase().includes(query.trim().toLowerCase()))
    : rows;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs font-mono tracking-[0.25em] mb-1" style={{ color: GOLD }}>
            PLATSTOCK · REPORT LIBRARY
          </div>
          <h1 className="text-3xl font-black tracking-tight">Client Reports</h1>
          <p className="text-sm mt-1" style={{ color: MUTED }}>
            Every diagnostic you run is saved here. Open any report to view or print it.
          </p>
        </div>
        <Link
          href="/advisor/diagnose"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono tracking-widest transition-all shrink-0"
          style={{ background: GOLD_DIM, border: `1px solid ${GOLD}40`, color: GOLD }}
        >
          <Upload size={13} />
          NEW DIAGNOSTIC
        </Link>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
        <input
          type="text"
          placeholder="Search by client label…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none"
          style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.08)", color: "white" }}
        />
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: `${GOLD}66`, borderTopColor: "transparent" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl text-center py-20 px-6"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)" }}>
          <FileText size={28} className="mx-auto mb-3" style={{ color: MUTED }} />
          <p className="text-sm font-semibold text-white">
            {query ? "No reports match that search." : "No reports yet"}
          </p>
          {!query && (
            <p className="text-xs mt-1.5" style={{ color: MUTED }}>
              Run your first diagnostic and it will be saved here automatically.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const gradeColor = GRADE_COLOR[r.overall_grade ?? ""] ?? MUTED;
            const behind = (r.opportunity_cost ?? 0) > 0;
            return (
              <div
                key={r.id}
                className="rounded-2xl p-5 flex items-center gap-5 transition-all hover:border-white/20"
                style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {/* Grade */}
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-black shrink-0"
                  style={{
                    color: gradeColor,
                    backgroundColor: `${gradeColor}14`,
                    border: `1.5px solid ${gradeColor}40`,
                  }}
                >
                  {r.overall_grade ?? "—"}
                </div>

                {/* Main */}
                <div className="flex-1 min-w-0">
                  <Link href={`/advisor/reports/${r.id}`}
                    className="text-sm font-bold text-white hover:underline underline-offset-2 truncate block">
                    {r.client_label}
                  </Link>
                  <p className="text-[11px] font-mono mt-0.5" style={{ color: MUTED }}>
                    {r.period_start} → {r.period_end}
                    {r.transaction_count != null && <> · {r.transaction_count} txs</>}
                    {r.composite_score != null && <> · score {Math.round(Number(r.composite_score))}</>}
                    {" · "}{new Date(r.created_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>

                {/* Opportunity cost */}
                {r.opportunity_cost != null && (
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-[9px] font-mono tracking-widest uppercase" style={{ color: MUTED }}>
                      {behind ? "Behind index" : "Ahead of index"}
                    </p>
                    <p className="text-sm font-black tabular-nums" style={{ color: behind ? RED : GREEN }}>
                      {fmtMoney(Math.abs(Number(r.opportunity_cost)), r.currency)}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/advisor/reports/${r.id}`}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all"
                    style={{ background: GOLD_DIM, border: `1px solid ${GOLD}35`, color: GOLD }}
                  >
                    OPEN
                  </Link>
                  <button
                    onClick={() => handleDelete(r.id, r.client_label)}
                    disabled={deleting === r.id}
                    className="p-2 rounded-lg transition-all hover:bg-red-500/10 disabled:opacity-40"
                    style={{ color: RED }}
                    aria-label="Delete report"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
