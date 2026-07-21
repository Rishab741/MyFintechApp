"use client";

/**
 * /advisor/reports — the firm's report library, rendered as a visual card
 * gallery rather than a data table. Each card shows a grade ring, a
 * downsampled wealth-path sparkline (stored at save time — see
 * app/api/advisor/reports/route.ts), and the opportunity-cost headline, so
 * an advisor can scan a whole client roster without opening anything.
 *
 * List reads come straight through RLS (own-firm rows only); the
 * denormalized columns + sparkline mean this page never parses the full
 * diagnostic JSONB.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Eye, FileText, Search, Trash2, Upload, X } from "lucide-react";
import { GOLD, GOLD_DIM, GRADE_COLOR, GREEN, MUTED, RED, fmtMoney } from "@/components/advisor/diagnostic-report";

interface SparkPoint { date: string; net_position: number }

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
  sparkline:         SparkPoint[] | null;
}

const GRADE_FILTERS = ["All", "A", "B", "C", "D", "F"] as const;

// ── Mini sparkline (net position over time) ────────────────────────────────────

function Sparkline({ data, color }: { data: SparkPoint[]; color: string }) {
  if (data.length < 2) return <div className="h-10" />;

  const W = 240, H = 40, PAD = 3;
  const vals   = data.map(p => p.net_position);
  const minV   = Math.min(...vals, 0);
  const maxV   = Math.max(...vals, 0);
  const range  = maxV - minV || 1;
  const px = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const py = (v: number) => H - PAD - ((v - minV) / range) * (H - PAD * 2);

  const path = data.map((p, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(p.net_position)}`).join(" ");
  const area = `${path} L ${px(data.length - 1)} ${py(minV)} L ${px(0)} ${py(minV)} Z`;
  const zeroY = py(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {minV < 0 && maxV > 0 && (
        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      )}
      <path d={area} fill={`url(#spark-${color.replace("#", "")})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Delete confirmation modal ────────────────────────────────────────────────

function DeleteModal({
  label, onConfirm, onCancel, busy,
}: {
  label: string; onConfirm: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "#15141B", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base font-bold text-white">Delete report</h3>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-white/5" style={{ color: MUTED }}>
            <X size={16} />
          </button>
        </div>
        <p className="text-sm leading-relaxed mb-6" style={{ color: MUTED }}>
          Delete the saved report for <span className="text-white font-medium">&ldquo;{label}&rdquo;</span>?
          This cannot be undone and will not affect your monthly report quota.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.06)", color: "white" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: RED, color: "white" }}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Report card ───────────────────────────────────────────────────────────────

function ReportCard({
  r, onDelete, deleting,
}: {
  r: ReportRow; onDelete: (id: string, label: string) => void; deleting: boolean;
}) {
  const gradeColor = GRADE_COLOR[r.overall_grade ?? ""] ?? MUTED;
  const behind     = (r.opportunity_cost ?? 0) > 0;
  const sparkColor = r.sparkline && r.sparkline.length
    ? (r.sparkline[r.sparkline.length - 1].net_position >= 0 ? GREEN : RED)
    : MUTED;

  return (
    <div
      className="group relative rounded-2xl p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5"
      style={{
        background: "#111118",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.01)",
      }}
    >
      {/* Delete — top-right, appears on hover */}
      <button
        onClick={() => onDelete(r.id, r.client_label)}
        disabled={deleting}
        className="absolute top-4 right-4 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 disabled:opacity-40 z-10"
        style={{ color: RED }}
        aria-label="Delete report"
      >
        <Trash2 size={13} />
      </button>

      <Link href={`/advisor/reports/${r.id}`} className="flex flex-col gap-4">
        {/* Header: grade + client */}
        <div className="flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-lg flex items-center justify-center text-lg font-black shrink-0"
            style={{
              color: gradeColor,
              backgroundColor: `${gradeColor}14`,
              border: `1.5px solid ${gradeColor}40`,
            }}
          >
            {r.overall_grade ?? "—"}
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <p className="text-sm font-bold text-white truncate group-hover:underline underline-offset-2">
              {r.client_label}
            </p>
            <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: MUTED }}>
              {r.broker ?? "—"}
              {r.composite_score != null && <> · score {Math.round(Number(r.composite_score))}</>}
            </p>
          </div>
        </div>

        {/* Sparkline */}
        {r.sparkline && r.sparkline.length >= 2 ? (
          <Sparkline data={r.sparkline} color={sparkColor} />
        ) : (
          <div className="h-10 flex items-center justify-center text-[10px] font-mono" style={{ color: MUTED }}>
            no chart data
          </div>
        )}

        {/* Footer: opportunity cost + date */}
        <div className="flex items-end justify-between">
          <div>
            {r.opportunity_cost != null ? (
              <>
                <p className="text-[9px] font-mono tracking-widest uppercase" style={{ color: MUTED }}>
                  {behind ? "Behind index" : "Ahead of index"}
                </p>
                <p className="text-base font-black tabular-nums" style={{ color: behind ? RED : GREEN }}>
                  {fmtMoney(Math.abs(Number(r.opportunity_cost)), r.currency)}
                </p>
              </>
            ) : (
              <p className="text-[10px] font-mono" style={{ color: MUTED }}>
                {r.transaction_count != null ? `${r.transaction_count} transactions` : "—"}
              </p>
            )}
          </div>
          <p className="text-[10px] font-mono shrink-0" style={{ color: MUTED }}>
            {new Date(r.created_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" })}
          </p>
        </div>
      </Link>

      {/* Preview pill — bottom, revealed on hover */}
      <Link
        href={`/advisor/reports/${r.id}`}
        className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-mono tracking-widest opacity-0 group-hover:opacity-100 transition-all"
        style={{ background: GOLD_DIM, border: `1px solid ${GOLD}30`, color: GOLD }}
      >
        <Eye size={11} />
        PREVIEW
      </Link>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdvisorReportsPage() {
  const supabase = createClient();
  const [rows,     setRows]     = useState<ReportRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState("");
  const [grade,    setGrade]    = useState<typeof GRADE_FILTERS[number]>("All");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("advisor_reports")
      .select("id, client_label, broker, currency, overall_grade, composite_score, opportunity_cost, transaction_count, period_start, period_end, created_at, sparkline")
      .order("created_at", { ascending: false });
    setRows((data as ReportRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function confirmDelete() {
    if (!confirmTarget) return;
    setDeleting(confirmTarget.id);
    await supabase.from("advisor_reports").delete().eq("id", confirmTarget.id);
    setDeleting(null);
    setConfirmTarget(null);
    void load();
  }

  const filtered = useMemo(() => {
    let out = rows;
    if (grade !== "All") out = out.filter(r => r.overall_grade === grade);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter(r => r.client_label.toLowerCase().includes(q));
    }
    return out;
  }, [rows, grade, query]);

  const gradeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const g = r.overall_grade ?? "—";
      counts[g] = (counts[g] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs font-mono tracking-[0.25em] mb-1" style={{ color: GOLD }}>
            PLATSTOCK · REPORT LIBRARY
          </div>
          <h1 className="text-3xl font-black tracking-tight">Client Reports</h1>
          <p className="text-sm mt-1" style={{ color: MUTED }}>
            {rows.length > 0
              ? `${rows.length} saved report${rows.length === 1 ? "" : "s"}. Click any card to preview before printing or exporting.`
              : "Every diagnostic you run is saved here automatically."}
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

      {/* ── Search + grade filter ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
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
        <div className="flex gap-1.5 overflow-x-auto">
          {GRADE_FILTERS.map(g => {
            const active = grade === g;
            const count  = g === "All" ? rows.length : (gradeCounts[g] ?? 0);
            const color  = g === "All" ? GOLD : (GRADE_COLOR[g] ?? MUTED);
            return (
              <button
                key={g}
                onClick={() => setGrade(g)}
                className="px-3 py-2 rounded-xl text-xs font-mono font-semibold transition-all shrink-0"
                style={{
                  background: active ? `${color}18` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? `${color}50` : "rgba(255,255,255,0.08)"}`,
                  color: active ? color : MUTED,
                }}
              >
                {g} {count > 0 && <span className="opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Gallery ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-5 h-[196px] animate-pulse"
              style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.05)" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl text-center py-20 px-6"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)" }}>
          <FileText size={28} className="mx-auto mb-3" style={{ color: MUTED }} />
          <p className="text-sm font-semibold text-white">
            {query || grade !== "All" ? "No reports match your filters." : "No reports yet"}
          </p>
          {!query && grade === "All" && (
            <p className="text-xs mt-1.5" style={{ color: MUTED }}>
              Run your first diagnostic and it will be saved here automatically.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => (
            <ReportCard
              key={r.id}
              r={r}
              deleting={deleting === r.id}
              onDelete={(id, label) => setConfirmTarget({ id, label })}
            />
          ))}
        </div>
      )}

      {confirmTarget && (
        <DeleteModal
          label={confirmTarget.label}
          busy={deleting === confirmTarget.id}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
