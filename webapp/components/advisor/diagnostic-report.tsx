"use client";

import React from "react";

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

export interface Diagnostic {
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

  // Market-data enrichment (null when prices were unavailable)
  currency?: string;
  estimated_portfolio_value?: number | null;
  live_price_coverage?: number | null;
  benchmark_symbol?: string | null;
  benchmark_end_value?: number | null;
  benchmark_mwr_annualized?: number | null;
  alpha_vs_benchmark_pp?: number | null;
  opportunity_cost_dollars?: number | null;
  risk_suite?: {
    twr_annualized_pct: number;
    volatility_pct: number;
    sharpe: number | null;
    sortino: number | null;
    max_drawdown_pct: number;
    max_drawdown_peak: string;
    max_drawdown_trough: string;
    cvar_95_daily_pct: number;
    beta: number | null;
    observation_days: number;
  } | null;
  behavioral_v2?: {
    disposition_pgr: number | null;
    disposition_plr: number | null;
    disposition_ratio: number | null;
    fomo_index_pct: number | null;
    buys_after_rally_pct: number | null;
    market_panic_sell_pct: number | null;
    annual_turnover_x: number | null;
    trades_per_year: number;
  } | null;
  statistics?: {
    sample_pairs: number;
    confidence: string;
    behavioral_tax_ci_low_pp: number | null;
    behavioral_tax_ci_high_pp: number | null;
    realized_return_ci_low: number | null;
    realized_return_ci_high: number | null;
    win_rate_p_value: number | null;
    win_rate_verdict: string | null;
  } | null;
  tax_analysis?: {
    currency: string;
    marginal_rate_assumed: number;
    short_term_gain: number;
    long_term_gain: number;
    short_term_loss: number;
    pct_gains_taken_early: number | null;
    est_discount_forgone: number;
    near_miss_sales: number;
    near_miss_gain: number;
    avg_hold_winners_days: number | null;
    avg_hold_losers_days: number | null;
  } | null;
  projection?: {
    horizon_years: number;
    start_value: number;
    mu_current: number;
    sigma_current: number;
    mu_disciplined: number;
    sigma_disciplined: number;
    yearly: {
      year: number;
      cur_p10: number; cur_p50: number; cur_p90: number;
      dis_p10: number; dis_p50: number; dis_p90: number;
    }[];
    terminal_gap_p50: number;
  } | null;
  score_v2?: {
    composite: number;
    grade: string;
    subscores: Record<string, number>;
    weights_used: Record<string, number>;
  } | null;
  narrative?: string[] | null;
}

const SUBSCORE_LABEL: Record<string, string> = {
  alpha:           "Returns vs Index",
  discipline:      "Sell Discipline",
  timing:          "Entry Timing",
  tax_efficiency:  "Tax Efficiency",
  turnover:        "Trading Costs",
  diversification: "Diversification",
};

// ── Projection fan chart ──────────────────────────────────────────────────────

function ProjectionChart({ p, ccy }: { p: NonNullable<Diagnostic["projection"]>; ccy?: string }) {
  const W = 760, H = 220;
  const PAD = { t: 14, r: 96, b: 24, l: 8 };
  const IW = W - PAD.l - PAD.r;
  const IH = H - PAD.t - PAD.b;

  const rows = p.yearly;
  const maxY = Math.max(...rows.map(r => r.dis_p90), ...rows.map(r => r.cur_p90)) * 1.04;
  const px = (yr: number) => PAD.l + (yr / p.horizon_years) * IW;
  const py = (v: number) => PAD.t + IH - (v / maxY) * IH;

  const band = (lo: keyof typeof rows[0], hi: keyof typeof rows[0]) =>
    `M ${px(0)} ${py(p.start_value)} ` +
    rows.map(r => `L ${px(r.year)} ${py(r[hi] as number)}`).join(" ") +
    ` L ${px(rows[rows.length - 1].year)} ${py(rows[rows.length - 1][lo] as number)} ` +
    rows.slice().reverse().map(r => `L ${px(r.year)} ${py(r[lo] as number)}`).join(" ") +
    ` Z`;

  const median = (k: keyof typeof rows[0]) =>
    `M ${px(0)} ${py(p.start_value)} ` +
    rows.map(r => `L ${px(r.year)} ${py(r[k] as number)}`).join(" ");

  const last = rows[rows.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* Bands */}
      <path d={band("dis_p10", "dis_p90")} fill={GREEN} opacity={0.10} />
      <path d={band("cur_p10", "cur_p90")} fill={RED}   opacity={0.10} />
      {/* Medians */}
      <path d={median("dis_p50")} fill="none" stroke={GREEN} strokeWidth={2} />
      <path d={median("cur_p50")} fill="none" stroke={RED}   strokeWidth={2} strokeDasharray="5 3" />
      {/* Terminal labels */}
      <text x={px(last.year) + 6} y={py(last.dis_p50) + 4} fill={GREEN} fontSize={11}
        fontFamily="ui-monospace, monospace" fontWeight="bold">
        {fmtMoney(last.dis_p50, ccy)}
      </text>
      <text x={px(last.year) + 6} y={py(last.cur_p50) + 4} fill={RED} fontSize={11}
        fontFamily="ui-monospace, monospace" fontWeight="bold">
        {fmtMoney(last.cur_p50, ccy)}
      </text>
      {/* Year labels */}
      {[Math.round(p.horizon_years / 2), p.horizon_years].map(yr => (
        <text key={yr} x={px(yr)} y={H - 6} fill={MUTED} fontSize={9}
          textAnchor="middle" fontFamily="ui-monospace, monospace">
          {yr}y
        </text>
      ))}
    </svg>
  );
}

export function fmtMoney(v: number, ccy = "USD") {
  const sym = ccy === "AUD" ? "A$" : "$";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000)     return `${sym}${(v / 1_000).toFixed(1)}K`;
  return `${sym}${v.toFixed(0)}`;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const GOLD    = "#C9A84C";
export const GOLD_DIM = "#C9A84C26";
export const RED     = "#C1613F";
export const GREEN   = "#7FA37A";
export const MUTED   = "#6B7280";

export const GRADE_COLOR: Record<string, string> = {
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

export function DiagnosticReport({ d }: { d: Diagnostic }) {
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

      {/* ── Executive summary ── */}
      {d.narrative && d.narrative.length > 0 && (
        <Card title="Executive Summary" glow={GOLD}>
          <div className="space-y-3">
            {d.narrative.map((para, i) => (
              <p key={i} className="text-sm leading-relaxed"
                style={{ color: "rgba(255,255,255,0.78)" }}>
                {para}
              </p>
            ))}
          </div>
        </Card>
      )}

      {/* ── Composite score + grades ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {d.score_v2 ? (
          <Card title="Composite Score">
            <div className="flex items-center gap-5 mb-4">
              <div
                className="w-20 h-20 rounded-xl flex flex-col items-center justify-center shrink-0"
                style={{
                  background: `${GRADE_COLOR[d.score_v2.grade] ?? MUTED}14`,
                  border: `1.5px solid ${GRADE_COLOR[d.score_v2.grade] ?? MUTED}40`,
                }}
              >
                <span className="text-3xl font-black tabular-nums"
                  style={{ color: GRADE_COLOR[d.score_v2.grade] ?? MUTED }}>
                  {Math.round(d.score_v2.composite)}
                </span>
                <span className="text-[9px] font-mono tracking-widest" style={{ color: MUTED }}>
                  / 100 · {d.score_v2.grade}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                Weighted across {Object.keys(d.score_v2.subscores).length} measured dimensions.
                Components without sufficient data are excluded, not defaulted.
              </p>
            </div>
            <div className="space-y-2.5">
              {Object.entries(d.score_v2.subscores).map(([key, val]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono w-28 shrink-0" style={{ color: MUTED }}>
                    {SUBSCORE_LABEL[key] ?? key}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full"
                      style={{
                        width: `${val}%`,
                        background: val >= 70 ? GREEN : val >= 45 ? GOLD : RED,
                      }} />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums w-8 text-right"
                    style={{ color: val >= 70 ? GREEN : val >= 45 ? GOLD : RED }}>
                    {Math.round(val)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <Card title="Dimension Grades">
          <div className="flex items-center justify-around h-full">
            <GradeBadge grade={d.grades.overall}    label="Overall"    />
            <GradeBadge grade={d.grades.timing}     label="Timing"     />
            <GradeBadge grade={d.grades.discipline} label="Discipline" />
            <GradeBadge grade={d.grades.returns}    label="Returns"    />
          </div>
        </Card>
      </div>

      {/* ── Opportunity cost hero (benchmark replay) ── */}
      {d.benchmark_symbol && d.opportunity_cost_dollars != null && d.estimated_portfolio_value != null && (
        <Card
          title={`Index Replay — same deposits, same days, into ${d.benchmark_symbol}`}
          glow={d.opportunity_cost_dollars > 0 ? RED : GREEN}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: MUTED }}>
                Actual portfolio
              </span>
              <span className="text-2xl font-black tabular-nums" style={{ color: "rgba(255,255,255,0.9)" }}>
                {fmtMoney(d.estimated_portfolio_value, d.currency)}
              </span>
              {d.live_price_coverage != null && (
                <span className="text-[10px] font-mono" style={{ color: MUTED }}>
                  {(d.live_price_coverage * 100).toFixed(0)}% live-priced
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: MUTED }}>
                Index counterfactual
              </span>
              <span className="text-2xl font-black tabular-nums" style={{ color: GOLD }}>
                {d.benchmark_end_value != null ? fmtMoney(d.benchmark_end_value, d.currency) : "—"}
              </span>
              {d.benchmark_mwr_annualized != null && (
                <span className="text-[10px] font-mono" style={{ color: MUTED }}>
                  {d.benchmark_mwr_annualized >= 0 ? "+" : ""}{d.benchmark_mwr_annualized.toFixed(1)}% MWR
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: MUTED }}>
                {d.opportunity_cost_dollars > 0 ? "Left on the table" : "Ahead of the index"}
              </span>
              <span
                className="text-2xl font-black tabular-nums"
                style={{ color: d.opportunity_cost_dollars > 0 ? RED : GREEN }}
              >
                {fmtMoney(Math.abs(d.opportunity_cost_dollars), d.currency)}
              </span>
              {d.alpha_vs_benchmark_pp != null && (
                <span className="text-[10px] font-mono" style={{ color: MUTED }}>
                  alpha {d.alpha_vs_benchmark_pp >= 0 ? "+" : ""}{d.alpha_vs_benchmark_pp.toFixed(1)} pp/yr
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

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

      {/* ── Institutional risk + behavioral deep-dive (price-enriched) ── */}
      {(d.risk_suite || d.behavioral_v2) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {d.risk_suite && (
            <Card title="Institutional Risk Suite">
              <MetricRow
                label="TWR (annualized)"
                value={`${d.risk_suite.twr_annualized_pct >= 0 ? "+" : ""}${d.risk_suite.twr_annualized_pct.toFixed(1)}%`}
                color={d.risk_suite.twr_annualized_pct >= 0 ? GREEN : RED}
                sub={`${d.risk_suite.observation_days} trading days observed`}
              />
              <MetricRow
                label="Volatility (ann.)"
                value={`${d.risk_suite.volatility_pct.toFixed(1)}%`}
                color={d.risk_suite.volatility_pct > 25 ? RED : d.risk_suite.volatility_pct > 15 ? GOLD : GREEN}
              />
              {d.risk_suite.sharpe != null && (
                <MetricRow
                  label="Sharpe Ratio"
                  value={d.risk_suite.sharpe.toFixed(2)}
                  color={d.risk_suite.sharpe >= 1 ? GREEN : d.risk_suite.sharpe >= 0.5 ? GOLD : RED}
                  sub="excess return / total risk"
                />
              )}
              {d.risk_suite.sortino != null && (
                <MetricRow
                  label="Sortino Ratio"
                  value={d.risk_suite.sortino.toFixed(2)}
                  color={d.risk_suite.sortino >= 1.5 ? GREEN : d.risk_suite.sortino >= 0.75 ? GOLD : RED}
                  sub="excess return / downside risk"
                />
              )}
              <MetricRow
                label="Max Drawdown"
                value={`${d.risk_suite.max_drawdown_pct.toFixed(1)}%`}
                color={d.risk_suite.max_drawdown_pct < -25 ? RED : d.risk_suite.max_drawdown_pct < -12 ? GOLD : GREEN}
                sub={`${d.risk_suite.max_drawdown_peak} → ${d.risk_suite.max_drawdown_trough}`}
              />
              <MetricRow
                label="CVaR 95% (daily)"
                value={`−${d.risk_suite.cvar_95_daily_pct.toFixed(2)}%`}
                color={d.risk_suite.cvar_95_daily_pct > 3 ? RED : GOLD}
                sub="avg loss on the worst 5% of days"
              />
              {d.risk_suite.beta != null && (
                <MetricRow
                  label="Beta vs Index"
                  value={d.risk_suite.beta.toFixed(2)}
                  color={Math.abs(d.risk_suite.beta - 1) < 0.3 ? GREEN : GOLD}
                />
              )}
            </Card>
          )}

          {d.behavioral_v2 && (
            <Card title="Behavioral Deep-Dive">
              {d.behavioral_v2.disposition_ratio != null && (
                <MetricRow
                  label="Disposition Ratio"
                  value={`${d.behavioral_v2.disposition_ratio.toFixed(2)}×`}
                  color={d.behavioral_v2.disposition_ratio > 1.5 ? RED : d.behavioral_v2.disposition_ratio > 1.1 ? GOLD : GREEN}
                  sub="sells winners vs holds losers (Odean PGR/PLR)"
                />
              )}
              {d.behavioral_v2.fomo_index_pct != null && (
                <MetricRow
                  label="FOMO Index"
                  value={`${d.behavioral_v2.fomo_index_pct >= 0 ? "+" : ""}${d.behavioral_v2.fomo_index_pct.toFixed(1)}%`}
                  color={d.behavioral_v2.fomo_index_pct > 8 ? RED : d.behavioral_v2.fomo_index_pct > 3 ? GOLD : GREEN}
                  sub="avg 20-day run-up at moment of purchase"
                />
              )}
              {d.behavioral_v2.buys_after_rally_pct != null && (
                <MetricRow
                  label="Buys After >10% Rally"
                  value={`${d.behavioral_v2.buys_after_rally_pct.toFixed(0)}%`}
                  color={d.behavioral_v2.buys_after_rally_pct > 40 ? RED : GOLD}
                />
              )}
              {d.behavioral_v2.market_panic_sell_pct != null && (
                <MetricRow
                  label="Market-Panic Sells"
                  value={`${d.behavioral_v2.market_panic_sell_pct.toFixed(0)}%`}
                  color={d.behavioral_v2.market_panic_sell_pct > 40 ? RED : d.behavioral_v2.market_panic_sell_pct > 15 ? GOLD : GREEN}
                  sub="sells while index was ≥10% off its peak"
                />
              )}
              {d.behavioral_v2.annual_turnover_x != null && (
                <MetricRow
                  label="Annual Turnover"
                  value={`${d.behavioral_v2.annual_turnover_x.toFixed(1)}×`}
                  color={d.behavioral_v2.annual_turnover_x > 3 ? RED : d.behavioral_v2.annual_turnover_x > 1.5 ? GOLD : GREEN}
                  sub="portfolio traded per year"
                />
              )}
              <MetricRow
                label="Trades / Year"
                value={d.behavioral_v2.trades_per_year.toFixed(0)}
                color={d.behavioral_v2.trades_per_year > 100 ? RED : "rgba(255,255,255,0.85)"}
              />
            </Card>
          )}
        </div>
      )}

      {/* ── Tax efficiency + statistical confidence ── */}
      {(d.tax_analysis || d.statistics) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {d.tax_analysis && (
            <Card title={d.tax_analysis.currency === "AUD" ? "Tax Efficiency — CGT Discount" : "Tax Efficiency — Holding Periods"}>
              <MetricRow
                label="Gains Taken < 12 Months"
                value={d.tax_analysis.pct_gains_taken_early != null
                  ? `${d.tax_analysis.pct_gains_taken_early.toFixed(0)}%`
                  : "—"}
                color={
                  (d.tax_analysis.pct_gains_taken_early ?? 0) > 60 ? RED :
                  (d.tax_analysis.pct_gains_taken_early ?? 0) > 30 ? GOLD : GREEN
                }
                sub={d.tax_analysis.currency === "AUD"
                  ? "forfeits the 50% CGT discount"
                  : "taxed at short-term rates"}
              />
              <MetricRow
                label="Est. Avoidable Tax"
                value={fmtMoney(d.tax_analysis.est_discount_forgone, d.tax_analysis.currency)}
                color={d.tax_analysis.est_discount_forgone > 1000 ? RED : GOLD}
                sub={`at assumed ${(d.tax_analysis.marginal_rate_assumed * 100).toFixed(0)}% marginal rate`}
              />
              {d.tax_analysis.near_miss_sales > 0 && (
                <MetricRow
                  label="Near-Miss Sales"
                  value={`${d.tax_analysis.near_miss_sales}`}
                  color={RED}
                  sub={`winners sold at 9–12 months — ${fmtMoney(d.tax_analysis.near_miss_gain, d.tax_analysis.currency)} in gains`}
                />
              )}
              {d.tax_analysis.avg_hold_winners_days != null && (
                <MetricRow
                  label="Avg Hold — Winners"
                  value={`${Math.round(d.tax_analysis.avg_hold_winners_days)} days`}
                  color={d.tax_analysis.avg_hold_winners_days < 365 ? GOLD : GREEN}
                />
              )}
              {d.tax_analysis.avg_hold_losers_days != null && (
                <MetricRow
                  label="Avg Hold — Losers"
                  value={`${Math.round(d.tax_analysis.avg_hold_losers_days)} days`}
                  color={
                    d.tax_analysis.avg_hold_winners_days != null &&
                    d.tax_analysis.avg_hold_losers_days > d.tax_analysis.avg_hold_winners_days
                      ? RED : "rgba(255,255,255,0.85)"
                  }
                  sub="longer than winners = disposition effect"
                />
              )}
            </Card>
          )}

          {d.statistics && (
            <Card title="Statistical Confidence">
              <MetricRow
                label="Sample Size"
                value={`${d.statistics.sample_pairs} closed trades`}
                color={
                  d.statistics.confidence === "high" ? GREEN :
                  d.statistics.confidence === "moderate" ? GOLD : RED
                }
                sub={`${d.statistics.confidence} confidence`}
              />
              {d.statistics.behavioral_tax_ci_low_pp != null && d.statistics.behavioral_tax_ci_high_pp != null && (
                <MetricRow
                  label="Behavioral Tax 95% CI"
                  value={`${d.statistics.behavioral_tax_ci_low_pp.toFixed(1)} to ${d.statistics.behavioral_tax_ci_high_pp.toFixed(1)} pp`}
                  color={d.statistics.behavioral_tax_ci_low_pp > 0 ? RED
                    : d.statistics.behavioral_tax_ci_high_pp < 0 ? GREEN : GOLD}
                  sub="bootstrap, 2000 resamples"
                />
              )}
              {d.statistics.realized_return_ci_low != null && d.statistics.realized_return_ci_high != null && (
                <MetricRow
                  label="Avg Return 95% CI"
                  value={`${d.statistics.realized_return_ci_low.toFixed(1)}% to ${d.statistics.realized_return_ci_high.toFixed(1)}%`}
                  color={"rgba(255,255,255,0.85)"}
                />
              )}
              {d.statistics.win_rate_p_value != null && (
                <MetricRow
                  label="Win Rate p-value"
                  value={d.statistics.win_rate_p_value < 0.001 ? "<0.001" : d.statistics.win_rate_p_value.toFixed(3)}
                  color={d.statistics.win_rate_p_value < 0.05 ? GREEN : GOLD}
                  sub="vs coin-flip trading"
                />
              )}
              {d.statistics.win_rate_verdict && (
                <p className="text-xs leading-relaxed mt-3 font-mono" style={{ color: MUTED }}>
                  Verdict: {d.statistics.win_rate_verdict}
                </p>
              )}
            </Card>
          )}
        </div>
      )}

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

      {/* ── 20-year projection ── */}
      {d.projection && (
        <Card
          title={`${d.projection.horizon_years}-Year Projection — Current Behavior vs Disciplined Strategy`}
          glow={d.projection.terminal_gap_p50 > 0 ? GREEN : undefined}
        >
          <div className="flex flex-wrap gap-4 mb-3 text-[10px] font-mono" style={{ color: MUTED }}>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 inline-block" style={{ background: GREEN }} />
              Disciplined ({(d.projection.mu_disciplined * 100).toFixed(1)}% / {(d.projection.sigma_disciplined * 100).toFixed(0)}% vol)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 inline-block border-b border-dashed" style={{ borderColor: RED }} />
              Current behavior ({(d.projection.mu_current * 100).toFixed(1)}% / {(d.projection.sigma_current * 100).toFixed(0)}% vol)
            </span>
            <span>Shaded: 10th–90th percentile · 1,000 paths each</span>
          </div>
          <ProjectionChart p={d.projection} ccy={d.currency} />
          {d.projection.terminal_gap_p50 > 0 && (
            <p className="text-sm mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
              Median {d.projection.horizon_years}-year difference:{" "}
              <span className="font-bold" style={{ color: GREEN }}>
                {fmtMoney(d.projection.terminal_gap_p50, d.currency)}
              </span>{" "}
              — the compounded cost of the behaviors identified in this report.
            </p>
          )}
        </Card>
      )}

      {/* ── Methodology appendix ── */}
      <Card title="Methodology Notes">
        <div className="space-y-1.5 text-[11px] leading-relaxed font-mono" style={{ color: MUTED }}>
          <p>· Returns: money-weighted (IRR via Brent root-finding on the cash-flow schedule); open positions valued at latest market close where available.</p>
          <p>· Index replay: identical cash-flow dates and amounts applied to the benchmark; withdrawals capped at accumulated units.</p>
          <p>· Risk metrics: flow-adjusted daily returns on reconstructed positions; Sharpe/Sortino vs a 4% cash-rate assumption; CVaR is the mean of the worst 5% of daily returns.</p>
          <p>· Behavioral: disposition effect per Odean (1998) day-level PGR/PLR counting; FOMO measured as trailing 20-day return at purchase.</p>
          <p>· Confidence intervals: percentile bootstrap, 2,000 resamples, fixed seed. Win-rate significance: one-sided exact binomial vs p = 0.5.</p>
          {d.tax_analysis && (
            <p>· Tax: FIFO lot matching; {d.tax_analysis.currency === "AUD" ? "Australian CGT 50% discount at the 12-month boundary" : "long-term holding boundary at 12 months"}; assumed marginal rate {(d.tax_analysis.marginal_rate_assumed * 100).toFixed(0)}% — not personal tax advice.</p>
          )}
          {d.projection && (
            <p>· Projection: geometric Brownian motion, monthly steps, 1,000 paths per regime, drift/volatility clamped to [−15%, +25%] / [5%, 60%]. GBM understates tail risk; the bias applies to both regimes equally.</p>
          )}
          <p>· All computation is ephemeral — no client data is stored. Deterministic: identical inputs always reproduce this report.</p>
        </div>
      </Card>

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

