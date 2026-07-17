"use client";

import React, { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  Diagnostic, DiagnosticReport,
  GOLD, GOLD_DIM, GREEN, MUTED, RED,
} from "@/components/advisor/diagnostic-report";

// ── Broker options ────────────────────────────────────────────────────────────

const BROKERS = [
  { slug: "auto",        label: "Auto-detect (recommended)" },
  // Australia
  { slug: "commsec",     label: "CommSec" },
  { slug: "selfwealth",  label: "SelfWealth" },
  { slug: "stake",       label: "Stake" },
  { slug: "nabtrade",    label: "nabtrade" },
  { slug: "cmc_markets", label: "CMC Markets Invest" },
  { slug: "westpac",     label: "Westpac Online Investing" },
  // US
  { slug: "schwab",      label: "Charles Schwab" },
  { slug: "fidelity",    label: "Fidelity" },
  // Fallback
  { slug: "csv_generic", label: "Generic CSV / Robinhood / IBKR" },
];

type SaveState =
  | { kind: "idle" }
  | { kind: "saved"; id: string; used: number; limit: number }
  | { kind: "quota"; limit: number }
  | { kind: "anonymous" }    // not signed in as advisor — report not persisted
  | { kind: "failed"; detail: string };

// ── Upload form ───────────────────────────────────────────────────────────────

export default function AdvisorDiagnosePage() {
  const [file, setFile]         = useState<File | null>(null);
  const [broker, setBroker]     = useState("auto");
  const [firmName, setFirmName] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<Diagnostic | null>(null);
  const [save, setSave]         = useState<SaveState>({ kind: "idle" });
  const inputRef                = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv")) {
      setError("Only .csv files are supported.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
    setSave({ kind: "idle" });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) acceptFile(f);
    },
    [acceptFile],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) acceptFile(f);
    },
    [acceptFile],
  );

  // ── Persist the diagnostic to the firm's report library ────────────────────
  const persistReport = useCallback(async (diagnostic: Diagnostic, brokerSlug: string) => {
    try {
      const res = await fetch("/api/advisor/reports", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ diagnostic, broker: brokerSlug }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.id) {
        setSave({ kind: "saved", id: json.id, used: json.reports_used, limit: json.report_limit });
      } else if (res.status === 429) {
        setSave({ kind: "quota", limit: json.limit ?? 0 });
      } else if (res.status === 403) {
        setSave({ kind: "anonymous" });
      } else {
        // Surface the failure — a silently missing report is worse than a warning.
        setSave({ kind: "failed", detail: json.error ?? `HTTP ${res.status}` });
      }
    } catch {
      setSave({ kind: "failed", detail: "network error" });
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!file) return;

      setLoading(true);
      setError(null);
      setResult(null);
      setSave({ kind: "idle" });

      try {
        const fd = new FormData();
        fd.append("file",         file);
        fd.append("broker",       broker);
        fd.append("firm_name",    firmName  || "Advisor");
        fd.append("client_label", clientLabel || "Client Portfolio");

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        const res = await fetch(
          `${supabaseUrl}/functions/v1/b2b-diagnose`,
          {
            method:  "POST",
            headers: { apikey: anonKey },
            body:    fd,
          },
        );

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `Server error ${res.status}`);
        setResult(json as Diagnostic);

        // Persist to the report library (no-op for anonymous visitors).
        void persistReport(json as Diagnostic, broker);

        // Scroll to report
        setTimeout(() =>
          document.getElementById("report")?.scrollIntoView({ behavior: "smooth" }),
          80,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error — please try again.");
      } finally {
        setLoading(false);
      }
    },
    [file, broker, firmName, clientLabel, persistReport],
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

      {/* ── Page header ── */}
      <div className="space-y-2 print:hidden">
        <div className="text-xs font-mono tracking-[0.25em] mb-1"
          style={{ color: GOLD }}>
          PLATSTOCK · B2B ADVISOR TOOL
        </div>
        <h1 className="text-3xl font-black tracking-tight">Client Behavioral Diagnostic</h1>
        <p className="text-sm leading-relaxed max-w-xl" style={{ color: MUTED }}>
          Upload any brokerage CSV export to generate an institutional-grade behavioral analysis.
          Signed-in advisors get every diagnostic saved to their report library automatically.
        </p>
      </div>

      {/* ── Upload form ── */}
      <form onSubmit={handleSubmit} className="space-y-4 print:hidden">

        {/* Branding panel */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] font-mono tracking-widest mb-1.5"
              style={{ color: MUTED }}>
              FIRM NAME
            </label>
            <input
              type="text"
              placeholder="Your Advisory Firm"
              value={firmName}
              onChange={e => setFirmName(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
              style={{
                background: "#111118",
                border: `1px solid rgba(255,255,255,0.1)`,
                color: "white",
              }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono tracking-widest mb-1.5"
              style={{ color: MUTED }}>
              CLIENT LABEL (anonymised)
            </label>
            <input
              type="text"
              placeholder="e.g. Client A, Prospect #12"
              value={clientLabel}
              onChange={e => setClientLabel(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
              style={{
                background: "#111118",
                border: `1px solid rgba(255,255,255,0.1)`,
                color: "white",
              }}
            />
          </div>
        </div>

        {/* Broker selector */}
        <div>
          <label className="block text-[10px] font-mono tracking-widest mb-1.5"
            style={{ color: MUTED }}>
            BROKERAGE FORMAT
          </label>
          <div className="flex flex-wrap gap-2">
            {BROKERS.map(b => (
              <button
                key={b.slug}
                type="button"
                onClick={() => setBroker(b.slug)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all"
                style={{
                  background: broker === b.slug ? GOLD_DIM : "rgba(255,255,255,0.04)",
                  border: `1px solid ${broker === b.slug ? GOLD : "rgba(255,255,255,0.1)"}`,
                  color: broker === b.slug ? GOLD : MUTED,
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="relative rounded-2xl cursor-pointer transition-all text-center py-12 px-6"
          style={{
            background: dragging ? `${GOLD}08` : "rgba(255,255,255,0.02)",
            border: `2px dashed ${dragging ? GOLD : file ? GREEN : "rgba(255,255,255,0.12)"}`,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={onFileChange}
          />
          <div className="text-3xl mb-2">{file ? "✓" : "↑"}</div>
          <div className="text-sm font-semibold">
            {file ? file.name : "Drop CSV file here or click to browse"}
          </div>
          <div className="text-xs mt-1" style={{ color: MUTED }}>
            {file
              ? `${(file.size / 1024).toFixed(0)} KB · ready`
              : "CommSec, SelfWealth, Stake, Schwab, Fidelity + generic exports"}
          </div>
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{ background: `${RED}12`, border: `1px solid ${RED}30`, color: RED }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || loading}
          className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all disabled:opacity-40"
          style={{
            background: file && !loading
              ? `linear-gradient(135deg, ${GOLD} 0%, #B8924A 100%)`
              : "rgba(255,255,255,0.06)",
            color: file && !loading ? "#0A0A0F" : MUTED,
          }}
        >
          {loading ? "Analysing…" : "Run Behavioral Diagnostic"}
        </button>
      </form>

      {/* ── Save status ── */}
      {result && save.kind !== "idle" && (
        <div
          className="rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3 print:hidden"
          style={
            save.kind === "saved"
              ? { background: `${GREEN}10`, border: `1px solid ${GREEN}30`, color: GREEN }
              : save.kind === "failed"
              ? { background: `${RED}10`,   border: `1px solid ${RED}30`,   color: RED }
              : { background: `${GOLD}0D`,  border: `1px solid ${GOLD}30`,  color: GOLD }
          }
        >
          {save.kind === "saved" && (
            <>
              <span>
                Saved to your report library · {save.used}/{save.limit} reports used this month
              </span>
              <Link href={`/advisor/reports/${save.id}`} className="font-bold underline underline-offset-2 shrink-0">
                Open saved report →
              </Link>
            </>
          )}
          {save.kind === "quota" && (
            <span>
              Monthly report limit reached ({save.limit}). This diagnostic was not saved —
              upgrade your plan to keep saving reports.
            </span>
          )}
          {save.kind === "anonymous" && (
            <span>
              Running anonymously — <Link href="/advisor/signup" className="underline font-bold">create an advisor account</Link> to
              save reports to a library.
            </span>
          )}
          {save.kind === "failed" && (
            <span>
              The report rendered but could not be saved to your library ({save.detail}).
              Print/export it now, then contact support if this recurs.
            </span>
          )}
        </div>
      )}

      {/* ── Results ── */}
      {result && <DiagnosticReport d={result} />}

      {/* ── Print button ── */}
      {result && (
        <div className="flex justify-end print:hidden">
          <button
            onClick={() => window.print()}
            className="px-5 py-2.5 rounded-xl text-xs font-mono tracking-widest transition-all"
            style={{
              background: GOLD_DIM,
              border: `1px solid ${GOLD}40`,
              color: GOLD,
            }}
          >
            PRINT / SAVE PDF
          </button>
        </div>
      )}

      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          body { background: #fff !important; color: #111 !important; }
          #report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          form, .print\\:hidden, header, nav { display: none !important; }
          #report { display: block !important; }
        }
      `}</style>
    </div>
  );
}
