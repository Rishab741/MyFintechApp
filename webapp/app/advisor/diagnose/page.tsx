"use client";

import React, { useCallback, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WealthPoint {
  date: string;
  cumulative_in: number;
  cumulative_out: number;
  net_position: number;
}

interface DiagnosticGrades {
  overall: string;
  timing: string;
  discipline: string;
  returns: string;
}

interface Diagnostic {
  firm_name: string;
  client_label: string;
  analysis_date: string;
  transaction_count: number;
  period_start: string;
  period_end: string;
  profile_confidence: string;
  mwr_annualized: number;
  realized_return_avg: number;
  buy_hold_return_avg: number;
  behavioral_tax_pct: number;
  panic_liquidation_rate: number;
  timing_quality: number;
  avg_holding_days: number | null;
  loss_aversion_score: number;
  buy_dip_probability: number;
  trade_win_rate: number;
  avg_gain_on_winners: number;
  avg_loss_on_losers: number;
  profit_factor: number;
  grades: DiagnosticGrades;
  insights: string[];
  wealth_path: WealthPoint[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GOLD    = "#C9A84C";
const GOLD_DIM = "#C9A84C26";
const RED     = "#C1613F";
const GREEN   = "#7FA37A";
const MUTED   = "#6B7280";

const BROKERS = [
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

const GRADE_COLOR: Record<string, string> = {
  A: GREEN, B: "#7BA3C9", C: GOLD, D: "#B87A3F", F: RED,
};

// ── Wealth path SVG chart ─────────────────────────────────────────────────────

function WealthChart({ data }: { data: WealthPoint[] }) {
  if (data.length < 2) return null;

  const W = 760, H = 160;
  const PAD = { t: 16, r: 8, b: 28, l: 8 };
  const IW = W - PAD.l - PAD.r;
  const IH = H - PAD.t - PAD.b;

  const maxIn  = Math.max(...data.map(d => d.cumulative_in),  1);
  const maxOut = Math.max(...data.map(d => d.cumulative_out), 1);
  const maxY   = Math.max(maxIn, maxOut) * 1.05;

  const px = (i: number) => PAD.l + (i / (data.length - 1)) * IW;
  const py = (v: number) => PAD.t + IH - (v / maxY) * IH;

  const pathIn  = data.map((d, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(d.cumulative_in)}`).join(" ");
  const pathOut = data.map((d, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(d.cumulative_out)}`).join(" ");
  const areaOut = `${pathOut} L ${px(data.length - 1)} ${py(0)} L ${px(0)} ${py(0)} Z`;

  const fmt = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000    ? `$${(v / 1_000).toFixed(0)}K`
    : `$${v.toFixed(0)}`;

  // Date labels: first, mid, last
  const dateLabels = [0, Math.floor(data.length / 2), data.length - 1].map(i => ({
    x: px(i),
    label: data[i].date.slice(0, 7),
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: H }}
    >
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0"   stopColor={GREEN} stopOpacity="0.22" />
          <stop offset="1"   stopColor={GREEN} stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0"   stopColor={RED} stopOpacity="0.14" />
          <stop offset="1"   stopColor={RED} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Zero line */}
      <line x1={PAD.l} y1={py(0)} x2={PAD.l + IW} y2={py(0)}
        stroke={`${GOLD}30`} strokeWidth={1} />

      {/* Received area */}
      <path d={areaOut} fill="url(#areaGrad)" />
      {/* Deployed area */}
      <path
        d={`${pathIn} L ${px(data.length - 1)} ${py(0)} L ${px(0)} ${py(0)} Z`}
        fill="url(#inGrad)"
      />

      {/* Lines */}
      <path d={pathIn}  fill="none" stroke={RED}   strokeWidth={1.5} strokeLinecap="round" />
      <path d={pathOut} fill="none" stroke={GREEN} strokeWidth={2}   strokeLinecap="round" />

      {/* End dot — deployed */}
      <circle cx={px(data.length - 1)} cy={py(data[data.length - 1].cumulative_in)}
        r={3} fill={RED} />
      {/* End dot — received */}
      <circle cx={px(data.length - 1)} cy={py(data[data.length - 1].cumulative_out)}
        r={3} fill={GREEN} />

      {/* Date labels */}
      {dateLabels.map(({ x, label }, i) => (
        <text key={i} x={x} y={H - 4} fill={MUTED}
          fontSize={9} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
          fontFamily="ui-monospace, monospace">
          {label}
        </text>
      ))}

      {/* Value callouts */}
      {(() => {
        const last = data[data.length - 1];
        return (
          <>
            <text x={px(data.length - 1) - 6}
              y={py(last.cumulative_out) - 5}
              fill={GREEN} fontSize={9} textAnchor="end"
              fontFamily="ui-monospace, monospace">
              {fmt(last.cumulative_out)}
            </text>
            <text x={px(data.length - 1) - 6}
              y={py(last.cumulative_in) + 13}
              fill={RED} fontSize={9} textAnchor="end"
              fontFamily="ui-monospace, monospace">
              {fmt(last.cumulative_in)}
            </text>
          </>
        );
      })()}
    </svg>
  );
}

// ── Grade badge ───────────────────────────────────────────────────────────────

function GradeBadge({ grade, label }: { grade: string; label: string }) {
  const color = GRADE_COLOR[grade] ?? MUTED;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl font-black"
        style={{
          color,
          backgroundColor: `${color}14`,
          border: `1.5px solid ${color}40`,
          boxShadow: `0 0 18px ${color}18`,
        }}
      >
        {grade}
      </div>
      <span className="text-[10px] font-mono tracking-widest uppercase"
        style={{ color: MUTED }}>
        {label}
      </span>
    </div>
  );
}

// ── Metric row ────────────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span className="text-xs font-mono tracking-wide" style={{ color: MUTED }}>
        {label}
      </span>
      <div className="text-right">
        <span className="text-sm font-bold tabular-nums"
          style={{ color: color ?? "rgba(255,255,255,0.85)" }}>
          {value}
        </span>
        {sub && (
          <span className="block text-[10px] font-mono" style={{ color: MUTED }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({
  children,
  title,
  glow,
  className = "",
}: {
  children: React.ReactNode;
  title?: string;
  glow?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: "#111118",
        border: `1px solid ${glow ? `${glow}30` : "rgba(255,255,255,0.07)"}`,
        borderTop: `1px solid ${glow ? `${glow}50` : "rgba(255,255,255,0.12)"}`,
        boxShadow: glow ? `0 0 24px ${glow}14` : "none",
      }}
    >
      {title && (
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-0.5 h-3.5 rounded-sm"
            style={{
              background: GOLD,
              boxShadow: `0 0 8px ${GOLD}`,
            }}
          />
          <span className="text-sm font-bold tracking-tight"
            style={{ color: "rgba(255,255,255,0.9)" }}>
            {title}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

// ── Diagnostic results ────────────────────────────────────────────────────────

function DiagnosticReport({ d }: { d: Diagnostic }) {
  const taxColor  = d.behavioral_tax_pct < -2 ? RED : d.behavioral_tax_pct > 2 ? GREEN : GOLD;
  const mwrColor  = d.mwr_annualized >= 10 ? GREEN : d.mwr_annualized >= 0 ? GOLD : RED;
  const panicColor = d.panic_liquidation_rate > 40 ? RED : d.panic_liquidation_rate > 20 ? GOLD : GREEN;

  return (
    <div id="report" className="space-y-4">

      {/* ── Report header ── */}
      <div
        className="rounded-2xl px-6 py-5 flex items-center justify-between print:rounded-none"
        style={{
          background: "linear-gradient(135deg, #13120E 0%, #0F0E14 100%)",
          border: `1px solid ${GOLD}28`,
          borderTop: `1px solid ${GOLD}50`,
        }}
      >
        <div>
          <div className="text-xs font-mono tracking-[0.2em] mb-1"
            style={{ color: GOLD }}>
            {d.firm_name.toUpperCase()} · BEHAVIORAL DIAGNOSTIC
          </div>
          <div className="text-xl font-bold tracking-tight">{d.client_label}</div>
          <div className="text-xs mt-1 font-mono" style={{ color: MUTED }}>
            {d.period_start} → {d.period_end} · {d.transaction_count} transactions · confidence:{" "}
            <span style={{ color: GOLD }}>{d.profile_confidence}</span>
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-xs font-mono" style={{ color: MUTED }}>Prepared</div>
          <div className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.7)" }}>
            {d.analysis_date}
          </div>
        </div>
      </div>

      {/* ── Grades row ── */}
      <Card>
        <div className="flex items-center justify-around">
          <GradeBadge grade={d.grades.overall}    label="Overall"    />
          <GradeBadge grade={d.grades.timing}     label="Timing"     />
          <GradeBadge grade={d.grades.discipline} label="Discipline" />
          <GradeBadge grade={d.grades.returns}    label="Returns"    />
        </div>
      </Card>

      {/* ── Key metrics row ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "MWR (IRR)",
            value: `${d.mwr_annualized >= 0 ? "+" : ""}${d.mwr_annualized.toFixed(1)}%`,
            sub: "annualised",
            color: mwrColor,
          },
          {
            label: "Behavioral Tax",
            value: `${d.behavioral_tax_pct >= 0 ? "+" : ""}${d.behavioral_tax_pct.toFixed(1)} pp`,
            sub: "vs buy-and-hold",
            color: taxColor,
          },
          {
            label: "Panic Sell Rate",
            value: `${d.panic_liquidation_rate.toFixed(0)}%`,
            sub: "exits during ≥10% drop",
            color: panicColor,
          },
          {
            label: "Trade Win Rate",
            value: `${d.trade_win_rate.toFixed(0)}%`,
            sub: "of closed positions",
            color: d.trade_win_rate >= 55 ? GREEN : d.trade_win_rate >= 45 ? GOLD : RED,
          },
        ].map(({ label, value, sub, color }) => (
          <div
            key={label}
            className="rounded-xl p-4 flex flex-col gap-1"
            style={{
              background: "#0D0D14",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span className="text-[10px] font-mono tracking-widest uppercase"
              style={{ color: MUTED }}>
              {label}
            </span>
            <span className="text-2xl font-black tabular-nums leading-none" style={{ color }}>
              {value}
            </span>
            <span className="text-[10px] font-mono" style={{ color: MUTED }}>{sub}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        {/* ── Behavioral metrics ── */}
        <Card title="Behavioral Profile">
          <MetricRow
            label="Timing Quality"
            value={d.timing_quality >= 0
              ? `+${(d.timing_quality * 100).toFixed(0)} / 100`
              : `${(d.timing_quality * 100).toFixed(0)} / 100`}
            color={d.timing_quality > 0.2 ? GREEN : d.timing_quality < -0.2 ? RED : GOLD}
            sub="buy-low sell-high score"
          />
          <MetricRow
            label="Loss Aversion"
            value={`${(d.loss_aversion_score * 100).toFixed(0)} / 100`}
            color={d.loss_aversion_score > 0.7 ? RED : GREEN}
            sub="higher = holds losers too long"
          />
          <MetricRow
            label="Dip-Buy Probability"
            value={`${d.buy_dip_probability.toFixed(0)}%`}
            color={d.buy_dip_probability > 50 ? GREEN : GOLD}
          />
          {d.avg_holding_days != null && (
            <MetricRow
              label="Avg Holding Period"
              value={`${Math.round(d.avg_holding_days)} days`}
              color={d.avg_holding_days < 30 ? RED : GREEN}
            />
          )}
        </Card>

        {/* ── Institutional suite ── */}
        <Card title="Trade Analytics">
          <MetricRow
            label="Realized Return (avg)"
            value={`${d.realized_return_avg >= 0 ? "+" : ""}${d.realized_return_avg.toFixed(1)}%`}
            color={d.realized_return_avg >= 0 ? GREEN : RED}
            sub="per completed trade"
          />
          <MetricRow
            label="Buy-and-Hold Equivalent"
            value={`${d.buy_hold_return_avg >= 0 ? "+" : ""}${d.buy_hold_return_avg.toFixed(1)}%`}
            color={MUTED}
          />
          <MetricRow
            label="Avg Gain (winners)"
            value={`+${d.avg_gain_on_winners.toFixed(1)}%`}
            color={GREEN}
          />
          <MetricRow
            label="Avg Loss (losers)"
            value={`${d.avg_loss_on_losers.toFixed(1)}%`}
            color={RED}
          />
          <MetricRow
            label="Profit Factor"
            value={d.profit_factor >= 999 ? "∞" : d.profit_factor.toFixed(2)}
            color={d.profit_factor >= 2 ? GREEN : d.profit_factor >= 1 ? GOLD : RED}
            sub="total gains / total losses"
          />
        </Card>
      </div>

      {/* ── Wealth path chart ── */}
      {d.wealth_path.length >= 2 && (
        <Card title="Wealth Path — Deployed vs Returned">
          <div className="flex gap-4 mb-3 text-[10px] font-mono" style={{ color: MUTED }}>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 inline-block" style={{ background: GREEN }} />
              Cash received (sells)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 inline-block" style={{ background: RED }} />
              Capital deployed (buys)
            </span>
          </div>
          <WealthChart data={d.wealth_path} />
        </Card>
      )}

      {/* ── Insights ── */}
      {d.insights.length > 0 && (
        <Card title="Advisor Insights">
          <div className="space-y-3">
            {d.insights.map((text, i) => {
              const isPositive = /exceptional|added value|contrarian|strong|disciplin/i.test(text);
              const isNegative = /high panic|behavioral tax|adverse|elevated loss|warrants/i.test(text);
              const accent = isPositive ? GREEN : isNegative ? RED : GOLD;
              return (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg px-4 py-3"
                  style={{
                    background: `${accent}08`,
                    borderLeft: `3px solid ${accent}`,
                    border: `1px solid ${accent}18`,
                    borderLeftWidth: 3,
                    borderLeftColor: accent,
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
                  />
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {text}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Print footer ── */}
      <div
        className="rounded-xl px-5 py-3 flex items-center justify-between text-[10px] font-mono print:mt-8"
        style={{
          background: "#0D0D14",
          border: "1px solid rgba(255,255,255,0.05)",
          color: MUTED,
        }}
      >
        <span>Platstock · B2B RIA Diagnostic · Confidential</span>
        <span>{d.analysis_date} · {d.firm_name}</span>
      </div>
    </div>
  );
}

// ── Upload form ───────────────────────────────────────────────────────────────

export default function AdvisorDiagnosePage() {
  const [file, setFile]         = useState<File | null>(null);
  const [broker, setBroker]     = useState("csv_generic");
  const [firmName, setFirmName] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<Diagnostic | null>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv")) {
      setError("Only .csv files are supported.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!file) return;

      setLoading(true);
      setError(null);
      setResult(null);

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
    [file, broker, firmName, clientLabel],
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
          No account required. Nothing is stored.
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
              : "Schwab, Fidelity, Robinhood, IBKR transaction history exports"}
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
          form, .print\\:hidden { display: none !important; }
          #report { display: block !important; }
        }
      `}</style>
    </div>
  );
}
