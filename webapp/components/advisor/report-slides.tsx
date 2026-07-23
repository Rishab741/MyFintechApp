"use client";

/**
 * The slide-deck presentation layer.
 *
 * Why slides instead of one long scrolling document with a mode toggle:
 * a toggle changes what's visible on ONE page — the underlying document is
 * still a single artifact, and it's easy to print or screen-share the wrong
 * state by accident. A deck is structurally two different documents: the
 * Prospect deck and the Compliance deck have different slide COUNTS and
 * different slide CONTENT, built from two separate arrays. There's no
 * shared "page" whose state could be wrong — you're always looking at one
 * specific slide of one specific deck.
 *
 * Design intent: beat a Bloomberg-style data dump on the thing Bloomberg
 * never bothers with — restraint. One idea per slide, real whitespace, a
 * cover and a close (a terminal export has neither), and a hero number in
 * type large enough to read from across a table.
 */

import React, { useEffect, useState } from "react";
import {
  Diagnostic, WealthPoint, fmtMoney,
  GOLD, GOLD_DIM, RED, GREEN, MUTED, STEEL, GRADE_COLOR,
  WealthChart, ProjectionChart, GradeBadge, MetricRow,
} from "@/components/advisor/diagnostic-report";
import { Presentation, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";

export type ReportMode = "prospect" | "compliance";

export interface Slide {
  id:      string;
  eyebrow: string;
  node:    React.ReactNode;
}

function modeAccent(mode: ReportMode) {
  return mode === "prospect" ? GOLD : STEEL;
}

// ── Slide frame ───────────────────────────────────────────────────────────────

function SlideFrame({
  eyebrow, title, accent, center = false, children,
}: {
  eyebrow: string;
  title?: string;
  accent: string;
  center?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-3xl flex flex-col print:rounded-none h-full"
      style={{
        background: "linear-gradient(160deg, #121119 0%, #0A0A0F 100%)",
        border: `1px solid ${accent}22`,
        borderTop: `1px solid ${accent}55`,
        minHeight: 620,
      }}
    >
      <div className="px-8 sm:px-12 pt-9 pb-1">
        <div className="text-[11px] font-mono tracking-[0.22em] uppercase" style={{ color: accent }}>
          {eyebrow}
        </div>
        {title && (
          <div className="text-xl sm:text-2xl font-bold text-white mt-1.5 tracking-tight">{title}</div>
        )}
      </div>
      <div className={`flex-1 px-8 sm:px-12 py-6 flex flex-col ${center ? "justify-center" : ""}`}>
        {children}
      </div>
    </div>
  );
}

function SlideFooter({
  firmName, mode, index, total, accent,
}: {
  firmName: string; mode: ReportMode; index: number; total: number; accent: string;
}) {
  return (
    <div
      className="px-8 sm:px-12 py-3.5 flex items-center justify-between text-[10px] font-mono rounded-b-3xl print:rounded-none"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: MUTED, background: "rgba(0,0,0,0.15)" }}
    >
      <span>
        Platstock · {firmName} · {mode === "prospect" ? "Client Presentation" : "Compliance File — Internal Use Only"}
      </span>
      <span style={{ color: accent }}>{index} / {total}</span>
    </div>
  );
}

// ── Small building blocks used across several slides ───────────────────────────

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "#0D0D14", border: "1px solid rgba(255,255,255,0.06)" }}>
      <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: MUTED }}>{label}</span>
      <span className="text-2xl font-black tabular-nums leading-none" style={{ color: color ?? "white" }}>{value}</span>
      {sub && <span className="text-[10px] font-mono" style={{ color: MUTED }}>{sub}</span>}
    </div>
  );
}

function HeroNumber({ value, color, caption }: { value: string; color: string; caption: string }) {
  return (
    <div className="text-center">
      <div
        className="font-black tabular-nums leading-none tracking-tight"
        style={{ fontSize: "clamp(48px, 9vw, 92px)", color, textShadow: `0 0 60px ${color}30` }}
      >
        {value}
      </div>
      <p className="text-sm mt-4 max-w-md mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
        {caption}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROSPECT DECK
// ═══════════════════════════════════════════════════════════════════════════════

function buildProspectSlides(d: Diagnostic): Slide[] {
  const accent = GOLD;
  const grade  = d.grades?.overall ?? "—";
  const gradeColor = GRADE_COLOR[grade] ?? MUTED;
  const gap = d.opportunity_cost_dollars ?? null;
  const behind = gap != null && gap > 0;

  const slides: Slide[] = [];

  // 1 — Cover
  slides.push({
    id: "cover", eyebrow: "Cover",
    node: (
      <SlideFrame eyebrow={`${d.firm_name.toUpperCase()} · BEHAVIORAL DIAGNOSTIC`} accent={accent} center>
        <div className="flex items-center justify-between gap-8 flex-wrap">
          <div>
            <p className="text-[13px] font-mono tracking-widest uppercase mb-3" style={{ color: MUTED }}>
              Portfolio Behavioral Analysis
            </p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4">
              {d.client_label}
            </h1>
            <p className="text-sm font-mono" style={{ color: MUTED }}>
              {d.period_start} → {d.period_end}
            </p>
            <p className="text-sm font-mono mt-1" style={{ color: MUTED }}>
              Prepared {d.analysis_date} · {d.transaction_count} transactions reviewed
            </p>
          </div>
          <div
            className="w-28 h-28 rounded-3xl flex flex-col items-center justify-center shrink-0"
            style={{ background: `${gradeColor}12`, border: `2px solid ${gradeColor}45`, boxShadow: `0 0 50px ${gradeColor}20` }}
          >
            <span className="text-6xl font-black" style={{ color: gradeColor }}>{grade}</span>
            <span className="text-[9px] font-mono tracking-widest uppercase mt-1" style={{ color: MUTED }}>Overall</span>
          </div>
        </div>
      </SlideFrame>
    ),
  });

  // 2 — The Number (hero)
  if (gap != null && d.estimated_portfolio_value != null) {
    slides.push({
      id: "hero", eyebrow: "The Cost Of Timing",
      node: (
        <SlideFrame eyebrow="Index Replay" accent={accent} center>
          <HeroNumber
            value={fmtMoney(Math.abs(gap), d.currency)}
            color={behind ? RED : GREEN}
            caption={
              behind
                ? `left on the table — the same deposits into ${d.benchmark_symbol ?? "the index"} on the same days would be worth more today.`
                : `ahead of a simple ${d.benchmark_symbol ?? "index"} replay of the same deposits.`
            }
          />
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mt-10 w-full">
            <div className="text-center">
              <p className="text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: MUTED }}>Actual Portfolio</p>
              <p className="text-xl font-bold tabular-nums text-white">{fmtMoney(d.estimated_portfolio_value, d.currency)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: MUTED }}>Index Counterfactual</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: accent }}>
                {d.benchmark_end_value != null ? fmtMoney(d.benchmark_end_value, d.currency) : "—"}
              </p>
            </div>
          </div>
        </SlideFrame>
      ),
    });
  }

  // 3 — Key metrics
  slides.push({
    id: "metrics", eyebrow: "At A Glance",
    node: (
      <SlideFrame eyebrow="At A Glance" title="Performance Snapshot" accent={accent} center>
        <div className="grid grid-cols-2 gap-5 max-w-xl mx-auto w-full">
          <Stat label="MWR (IRR)" value={`${d.mwr_annualized >= 0 ? "+" : ""}${d.mwr_annualized.toFixed(1)}%`}
            color={d.mwr_annualized >= 10 ? GREEN : d.mwr_annualized >= 0 ? GOLD : RED} sub="annualised" />
          <Stat label="Behavioral Tax" value={`${d.behavioral_tax_pct >= 0 ? "+" : ""}${d.behavioral_tax_pct.toFixed(1)} pp`}
            color={d.behavioral_tax_pct < -2 ? RED : d.behavioral_tax_pct > 2 ? GREEN : GOLD} sub="vs buy-and-hold" />
          <Stat label="Panic Sell Rate" value={`${d.panic_liquidation_rate.toFixed(0)}%`}
            color={d.panic_liquidation_rate > 40 ? RED : d.panic_liquidation_rate > 20 ? GOLD : GREEN} sub="exits during ≥10% drop" />
          <Stat label="Trade Win Rate" value={`${d.trade_win_rate.toFixed(0)}%`}
            color={d.trade_win_rate >= 55 ? GREEN : d.trade_win_rate >= 45 ? GOLD : RED} sub="of closed positions" />
        </div>
      </SlideFrame>
    ),
  });

  // 4 — Executive summary
  if (d.narrative && d.narrative.length > 0) {
    slides.push({
      id: "summary", eyebrow: "Executive Summary",
      node: (
        <SlideFrame eyebrow="Executive Summary" accent={accent} center>
          <div className="space-y-5 max-w-2xl mx-auto">
            {d.narrative.map((p, i) => (
              <p key={i} className={i === 0 ? "text-lg leading-relaxed font-medium" : "text-sm leading-relaxed"}
                style={{ color: i === 0 ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)" }}>
                {p}
              </p>
            ))}
          </div>
        </SlideFrame>
      ),
    });
  }

  // 5 — Wealth path
  if (d.wealth_path.length >= 2) {
    slides.push({
      id: "wealth", eyebrow: "Capital Flow",
      node: (
        <SlideFrame eyebrow="Capital Flow" title="Deployed vs. Returned" accent={accent} center>
          <div className="flex gap-5 mb-4 text-[11px] font-mono" style={{ color: MUTED }}>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block" style={{ background: GREEN }} />Cash received</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block" style={{ background: RED }} />Capital deployed</span>
          </div>
          <WealthChart data={d.wealth_path} />
        </SlideFrame>
      ),
    });
  }

  // 6 — Projection
  if (d.projection) {
    slides.push({
      id: "projection", eyebrow: `${d.projection.horizon_years}-Year Outlook`,
      node: (
        <SlideFrame eyebrow={`${d.projection.horizon_years}-Year Outlook`} title="Current Path vs. Disciplined Strategy" accent={accent} center>
          <div className="flex flex-wrap gap-4 mb-3 text-[10px] font-mono" style={{ color: MUTED }}>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block" style={{ background: GREEN }} />Disciplined</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block border-b border-dashed" style={{ borderColor: RED }} />Current behavior</span>
          </div>
          <ProjectionChart p={d.projection} ccy={d.currency} />
          {d.projection.terminal_gap_p50 > 0 && (
            <p className="text-base mt-5 text-center" style={{ color: "rgba(255,255,255,0.85)" }}>
              Median {d.projection.horizon_years}-year difference:{" "}
              <span className="font-black" style={{ color: GREEN }}>{fmtMoney(d.projection.terminal_gap_p50, d.currency)}</span>
            </p>
          )}
        </SlideFrame>
      ),
    });
  }

  // 7 — Findings
  const findings = d.insights.slice(0, 3);
  if (findings.length > 0) {
    slides.push({
      id: "findings", eyebrow: "Key Findings",
      node: (
        <SlideFrame eyebrow="Key Findings" accent={accent} center>
          <div className="space-y-5 max-w-2xl mx-auto w-full">
            {findings.map((text, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-black"
                  style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}40` }}>
                  {i + 1}
                </div>
                <p className="text-base leading-relaxed pt-1" style={{ color: "rgba(255,255,255,0.85)" }}>{text}</p>
              </div>
            ))}
          </div>
        </SlideFrame>
      ),
    });
  }

  // 8 — Closing
  slides.push({
    id: "closing", eyebrow: "Next Steps",
    node: (
      <SlideFrame eyebrow="Next Steps" accent={accent} center>
        <div className="text-center max-w-lg mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-4 tracking-tight">
            A disciplined path forward is worth the conversation.
          </h2>
          <p className="text-sm leading-relaxed mb-8" style={{ color: MUTED }}>
            This analysis is based on the historical transaction data provided and is for illustrative
            purposes only. Index-replay and projection figures are hypothetical, do not guarantee future
            results, and rely on assumptions available from your advisor. Past performance is not
            indicative of future returns.
          </p>
          <p className="text-sm font-mono" style={{ color: accent }}>{d.firm_name}</p>
        </div>
      </SlideFrame>
    ),
  });

  return slides;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE DECK
// ═══════════════════════════════════════════════════════════════════════════════

const SUBSCORE_LABEL: Record<string, string> = {
  alpha: "Returns vs Index", discipline: "Sell Discipline", timing: "Entry Timing",
  tax_efficiency: "Tax Efficiency", turnover: "Trading Costs", diversification: "Diversification",
};

function buildComplianceSlides(d: Diagnostic): Slide[] {
  const accent = STEEL;
  const slides: Slide[] = [];

  // 1 — Cover
  slides.push({
    id: "cover", eyebrow: `${d.firm_name.toUpperCase()} · COMPLIANCE FILE`,
    node: (
      <SlideFrame eyebrow={`${d.firm_name.toUpperCase()} · COMPLIANCE FILE`} accent={accent} center>
        <p className="text-[13px] font-mono tracking-widest uppercase mb-3" style={{ color: MUTED }}>
          Full Diagnostic Record — Internal Use Only
        </p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4">{d.client_label}</h1>
        <p className="text-sm font-mono" style={{ color: MUTED }}>{d.period_start} → {d.period_end}</p>
        <p className="text-sm font-mono mt-1" style={{ color: MUTED }}>
          Prepared {d.analysis_date} · {d.transaction_count} transactions
          {d.profile_confidence && <> · confidence: <span style={{ color: accent }}>{d.profile_confidence}</span></>}
        </p>
      </SlideFrame>
    ),
  });

  // 2 — Executive summary
  if (d.narrative && d.narrative.length > 0) {
    slides.push({
      id: "summary", eyebrow: "Executive Summary",
      node: (
        <SlideFrame eyebrow="Executive Summary" accent={accent} center>
          <div className="space-y-4 max-w-2xl mx-auto">
            {d.narrative.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>{p}</p>
            ))}
          </div>
        </SlideFrame>
      ),
    });
  }

  // 3 — Composite score
  if (d.score_v2) {
    const gc = GRADE_COLOR[d.score_v2.grade] ?? MUTED;
    slides.push({
      id: "score", eyebrow: "Composite Score",
      node: (
        <SlideFrame eyebrow="Composite Score" title="Weighted Across Measured Dimensions" accent={accent} center>
          <div className="flex items-center gap-8 mb-8 flex-wrap">
            <div className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center shrink-0"
              style={{ background: `${gc}14`, border: `1.5px solid ${gc}40` }}>
              <span className="text-3xl font-black" style={{ color: gc }}>{Math.round(d.score_v2.composite)}</span>
              <span className="text-[9px] font-mono tracking-widest" style={{ color: MUTED }}>/ 100 · {d.score_v2.grade}</span>
            </div>
            <div className="flex items-center gap-6">
              <GradeBadge grade={d.grades.overall} label="Overall" />
              <GradeBadge grade={d.grades.timing} label="Timing" />
              <GradeBadge grade={d.grades.discipline} label="Discipline" />
              <GradeBadge grade={d.grades.returns} label="Returns" />
            </div>
          </div>
          {Object.keys(d.score_v2.subscores).length > 0 && (
            <div className="space-y-3 max-w-lg">
              {Object.entries(d.score_v2.subscores).map(([key, val]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-[11px] font-mono w-32 shrink-0" style={{ color: MUTED }}>{SUBSCORE_LABEL[key] ?? key}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full" style={{ width: `${val}%`, background: val >= 70 ? GREEN : val >= 45 ? GOLD : RED }} />
                  </div>
                  <span className="text-xs font-mono tabular-nums w-8 text-right" style={{ color: val >= 70 ? GREEN : val >= 45 ? GOLD : RED }}>{Math.round(val)}</span>
                </div>
              ))}
            </div>
          )}
        </SlideFrame>
      ),
    });
  }

  // 4 — Index replay + key metrics combined
  slides.push({
    id: "metrics", eyebrow: "Performance & Replay",
    node: (
      <SlideFrame eyebrow="Performance & Replay" accent={accent} center>
        <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto w-full mb-6">
          <Stat label="MWR (IRR)" value={`${d.mwr_annualized >= 0 ? "+" : ""}${d.mwr_annualized.toFixed(1)}%`} sub="annualised" />
          <Stat label="Behavioral Tax" value={`${d.behavioral_tax_pct >= 0 ? "+" : ""}${d.behavioral_tax_pct.toFixed(1)} pp`} sub="vs buy-and-hold" />
          <Stat label="Panic Sell Rate" value={`${d.panic_liquidation_rate.toFixed(0)}%`} sub="exits during ≥10% drop" />
          <Stat label="Trade Win Rate" value={`${d.trade_win_rate.toFixed(0)}%`} sub="of closed positions" />
        </div>
        {d.opportunity_cost_dollars != null && d.benchmark_symbol && (
          <p className="text-sm text-center" style={{ color: MUTED }}>
            Index replay vs {d.benchmark_symbol}: {fmtMoney(Math.abs(d.opportunity_cost_dollars), d.currency)}{" "}
            {d.opportunity_cost_dollars > 0 ? "behind" : "ahead of"} the benchmark
            {d.alpha_vs_benchmark_pp != null && ` (alpha ${d.alpha_vs_benchmark_pp >= 0 ? "+" : ""}${d.alpha_vs_benchmark_pp.toFixed(1)} pp/yr)`}
          </p>
        )}
      </SlideFrame>
    ),
  });

  // 5 — Risk suite
  if (d.risk_suite) {
    const rs = d.risk_suite;
    slides.push({
      id: "risk", eyebrow: "Institutional Risk Suite",
      node: (
        <SlideFrame eyebrow="Institutional Risk Suite" accent={accent} center>
          <div className="max-w-lg mx-auto w-full">
            <MetricRow label="TWR (annualized)" value={`${rs.twr_annualized_pct >= 0 ? "+" : ""}${rs.twr_annualized_pct.toFixed(1)}%`}
              color={rs.twr_annualized_pct >= 0 ? GREEN : RED} sub={`${rs.observation_days} trading days observed`} />
            <MetricRow label="Volatility (ann.)" value={`${rs.volatility_pct.toFixed(1)}%`}
              color={rs.volatility_pct > 25 ? RED : rs.volatility_pct > 15 ? GOLD : GREEN} />
            {rs.sharpe != null && <MetricRow label="Sharpe Ratio" value={rs.sharpe.toFixed(2)} color={rs.sharpe >= 1 ? GREEN : rs.sharpe >= 0.5 ? GOLD : RED} sub="excess return / total risk" />}
            {rs.sortino != null && <MetricRow label="Sortino Ratio" value={rs.sortino.toFixed(2)} color={rs.sortino >= 1.5 ? GREEN : rs.sortino >= 0.75 ? GOLD : RED} sub="excess return / downside risk" />}
            <MetricRow label="Max Drawdown" value={`${rs.max_drawdown_pct.toFixed(1)}%`}
              color={rs.max_drawdown_pct < -25 ? RED : rs.max_drawdown_pct < -12 ? GOLD : GREEN} sub={`${rs.max_drawdown_peak} → ${rs.max_drawdown_trough}`} />
            <MetricRow label="CVaR 95% (daily)" value={`−${rs.cvar_95_daily_pct.toFixed(2)}%`} color={rs.cvar_95_daily_pct > 3 ? RED : GOLD} sub="avg loss on the worst 5% of days" />
            {rs.beta != null && <MetricRow label="Beta vs Index" value={rs.beta.toFixed(2)} color={Math.abs(rs.beta - 1) < 0.3 ? GREEN : GOLD} />}
          </div>
        </SlideFrame>
      ),
    });
  }

  // 6 — Behavioral deep-dive + profile
  if (d.behavioral_v2) {
    const bv = d.behavioral_v2;
    slides.push({
      id: "behavioral", eyebrow: "Behavioral Deep-Dive",
      node: (
        <SlideFrame eyebrow="Behavioral Deep-Dive" accent={accent} center>
          <div className="max-w-lg mx-auto w-full">
            {bv.disposition_ratio != null && <MetricRow label="Disposition Ratio" value={`${bv.disposition_ratio.toFixed(2)}×`}
              color={bv.disposition_ratio > 1.5 ? RED : bv.disposition_ratio > 1.1 ? GOLD : GREEN} sub="sells winners vs holds losers (Odean PGR/PLR)" />}
            {bv.fomo_index_pct != null && <MetricRow label="FOMO Index" value={`${bv.fomo_index_pct >= 0 ? "+" : ""}${bv.fomo_index_pct.toFixed(1)}%`}
              color={bv.fomo_index_pct > 8 ? RED : bv.fomo_index_pct > 3 ? GOLD : GREEN} sub="avg 20-day run-up at moment of purchase" />}
            {bv.market_panic_sell_pct != null && <MetricRow label="Market-Panic Sells" value={`${bv.market_panic_sell_pct.toFixed(0)}%`}
              color={bv.market_panic_sell_pct > 40 ? RED : bv.market_panic_sell_pct > 15 ? GOLD : GREEN} sub="sells while index was ≥10% off its peak" />}
            {bv.annual_turnover_x != null && <MetricRow label="Annual Turnover" value={`${bv.annual_turnover_x.toFixed(1)}×`}
              color={bv.annual_turnover_x > 3 ? RED : bv.annual_turnover_x > 1.5 ? GOLD : GREEN} sub="portfolio traded per year" />}
            {d.timing_quality != null && <MetricRow label="Timing Quality" value={`${d.timing_quality >= 0 ? "+" : ""}${(d.timing_quality * 100).toFixed(0)} / 100`}
              color={d.timing_quality > 0.2 ? GREEN : d.timing_quality < -0.2 ? RED : GOLD} sub="buy-low sell-high score" />}
            {d.loss_aversion_score != null && <MetricRow label="Loss Aversion" value={`${(d.loss_aversion_score * 100).toFixed(0)} / 100`}
              color={d.loss_aversion_score > 0.7 ? RED : GREEN} sub="higher = holds losers too long" />}
          </div>
        </SlideFrame>
      ),
    });
  }

  // 7 — Trade analytics
  if (d.realized_return_avg != null) {
    slides.push({
      id: "trades", eyebrow: "Trade Analytics",
      node: (
        <SlideFrame eyebrow="Trade Analytics" accent={accent} center>
          <div className="max-w-lg mx-auto w-full">
            <MetricRow label="Realized Return (avg)" value={`${(d.realized_return_avg ?? 0) >= 0 ? "+" : ""}${(d.realized_return_avg ?? 0).toFixed(1)}%`}
              color={(d.realized_return_avg ?? 0) >= 0 ? GREEN : RED} sub="per completed trade" />
            <MetricRow label="Buy-and-Hold Equivalent" value={`${(d.buy_hold_return_avg ?? 0) >= 0 ? "+" : ""}${(d.buy_hold_return_avg ?? 0).toFixed(1)}%`} color={MUTED} />
            <MetricRow label="Avg Gain (winners)" value={`+${(d.avg_gain_on_winners ?? 0).toFixed(1)}%`} color={GREEN} />
            <MetricRow label="Avg Loss (losers)" value={`${(d.avg_loss_on_losers ?? 0).toFixed(1)}%`} color={RED} />
            <MetricRow label="Profit Factor" value={(d.profit_factor ?? 0) >= 999 ? "∞" : (d.profit_factor ?? 0).toFixed(2)}
              color={(d.profit_factor ?? 0) >= 2 ? GREEN : (d.profit_factor ?? 0) >= 1 ? GOLD : RED} sub="total gains / total losses" />
          </div>
        </SlideFrame>
      ),
    });
  }

  // 8 — Tax efficiency
  if (d.tax_analysis) {
    const t = d.tax_analysis;
    slides.push({
      id: "tax", eyebrow: t.currency === "AUD" ? "Tax Efficiency — CGT Discount" : "Tax Efficiency — Holding Periods",
      node: (
        <SlideFrame eyebrow={t.currency === "AUD" ? "Tax Efficiency — CGT Discount" : "Tax Efficiency — Holding Periods"} accent={accent} center>
          <div className="max-w-lg mx-auto w-full">
            <MetricRow label="Gains Taken < 12 Months" value={t.pct_gains_taken_early != null ? `${t.pct_gains_taken_early.toFixed(0)}%` : "—"}
              color={(t.pct_gains_taken_early ?? 0) > 60 ? RED : (t.pct_gains_taken_early ?? 0) > 30 ? GOLD : GREEN}
              sub={t.currency === "AUD" ? "forfeits the 50% CGT discount" : "taxed at short-term rates"} />
            <MetricRow label="Est. Avoidable Tax" value={fmtMoney(t.est_discount_forgone, t.currency)}
              color={t.est_discount_forgone > 1000 ? RED : GOLD} sub={`at assumed ${(t.marginal_rate_assumed * 100).toFixed(0)}% marginal rate`} />
            {t.near_miss_sales > 0 && <MetricRow label="Near-Miss Sales" value={`${t.near_miss_sales}`} color={RED}
              sub={`winners sold at 9–12 months — ${fmtMoney(t.near_miss_gain, t.currency)} in gains`} />}
            {t.avg_hold_winners_days != null && <MetricRow label="Avg Hold — Winners" value={`${Math.round(t.avg_hold_winners_days)} days`}
              color={t.avg_hold_winners_days < 365 ? GOLD : GREEN} />}
            {t.avg_hold_losers_days != null && <MetricRow label="Avg Hold — Losers" value={`${Math.round(t.avg_hold_losers_days)} days`}
              color={t.avg_hold_winners_days != null && t.avg_hold_losers_days > t.avg_hold_winners_days ? RED : "rgba(255,255,255,0.85)"}
              sub="longer than winners = disposition effect" />}
          </div>
        </SlideFrame>
      ),
    });
  }

  // 9 — Statistical confidence
  if (d.statistics) {
    const s = d.statistics;
    slides.push({
      id: "stats", eyebrow: "Statistical Confidence",
      node: (
        <SlideFrame eyebrow="Statistical Confidence" accent={accent} center>
          <div className="max-w-lg mx-auto w-full">
            <MetricRow label="Sample Size" value={`${s.sample_pairs} closed trades`}
              color={s.confidence === "high" ? GREEN : s.confidence === "moderate" ? GOLD : RED} sub={`${s.confidence} confidence`} />
            {s.behavioral_tax_ci_low_pp != null && s.behavioral_tax_ci_high_pp != null && (
              <MetricRow label="Behavioral Tax 95% CI" value={`${s.behavioral_tax_ci_low_pp.toFixed(1)} to ${s.behavioral_tax_ci_high_pp.toFixed(1)} pp`}
                color={s.behavioral_tax_ci_low_pp > 0 ? RED : s.behavioral_tax_ci_high_pp < 0 ? GREEN : GOLD} sub="bootstrap, 2000 resamples" />
            )}
            {s.win_rate_p_value != null && (
              <MetricRow label="Win Rate p-value" value={s.win_rate_p_value < 0.001 ? "<0.001" : s.win_rate_p_value.toFixed(3)}
                color={s.win_rate_p_value < 0.05 ? GREEN : GOLD} sub="vs coin-flip trading" />
            )}
          </div>
          {s.win_rate_verdict && (
            <p className="text-sm leading-relaxed mt-5 max-w-lg" style={{ color: MUTED }}>Verdict: {s.win_rate_verdict}</p>
          )}
        </SlideFrame>
      ),
    });
  }

  // 10 — Wealth path
  if (d.wealth_path.length >= 2) {
    slides.push({
      id: "wealth", eyebrow: "Capital Flow",
      node: (
        <SlideFrame eyebrow="Capital Flow" title="Deployed vs. Returned" accent={accent} center>
          <WealthChart data={d.wealth_path} />
        </SlideFrame>
      ),
    });
  }

  // 11 — Projection
  if (d.projection) {
    slides.push({
      id: "projection", eyebrow: `${d.projection.horizon_years}-Year Projection`,
      node: (
        <SlideFrame eyebrow={`${d.projection.horizon_years}-Year Projection`} accent={accent} center>
          <ProjectionChart p={d.projection} ccy={d.currency} />
        </SlideFrame>
      ),
    });
  }

  // 12 — All insights
  if (d.insights.length > 0) {
    slides.push({
      id: "insights", eyebrow: "Advisor Insights",
      node: (
        <SlideFrame eyebrow="Advisor Insights" accent={accent} center>
          <div className="space-y-3 max-w-2xl mx-auto w-full">
            {d.insights.map((text, i) => (
              <div key={i} className="flex gap-3 rounded-lg px-4 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: accent }} />
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{text}</p>
              </div>
            ))}
          </div>
        </SlideFrame>
      ),
    });
  }

  // 13 — Methodology
  slides.push({
    id: "methodology", eyebrow: "Methodology Notes",
    node: (
      <SlideFrame eyebrow="Methodology Notes" accent={accent} center>
        <div className="space-y-2 text-[12px] leading-relaxed font-mono max-w-2xl" style={{ color: MUTED }}>
          <p>· Returns: money-weighted (IRR via Brent root-finding); open positions valued at latest market close where available.</p>
          <p>· Index replay: identical cash-flow dates and amounts applied to the benchmark; withdrawals capped at accumulated units.</p>
          <p>· Risk metrics: flow-adjusted daily returns; Sharpe/Sortino vs a 4% cash-rate assumption; CVaR is the mean of the worst 5% of daily returns.</p>
          <p>· Behavioral: disposition effect per Odean (1998) day-level PGR/PLR counting; FOMO measured as trailing 20-day return at purchase.</p>
          <p>· Confidence intervals: percentile bootstrap, 2,000 resamples, fixed seed. Win-rate significance: one-sided exact binomial vs p = 0.5.</p>
          {d.tax_analysis && <p>· Tax: FIFO lot matching; assumed marginal rate {(d.tax_analysis.marginal_rate_assumed * 100).toFixed(0)}% — not personal tax advice.</p>}
          {d.projection && <p>· Projection: geometric Brownian motion, 1,000 paths per regime, drift/volatility clamped to [−15%, +25%] / [5%, 60%].</p>}
          <p>· All computation is ephemeral — no client data is stored. Deterministic: identical inputs always reproduce this report.</p>
        </div>
      </SlideFrame>
    ),
  });

  return slides;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mode picker — the "options" entry point
// ═══════════════════════════════════════════════════════════════════════════════

export function ModeOptionCards({
  mode, onChange,
}: {
  mode: ReportMode;
  onChange: (m: ReportMode) => void;
}) {
  const options: { key: ReportMode; icon: typeof Presentation; title: string; desc: string; accent: string }[] = [
    { key: "prospect", icon: Presentation, title: "Client Presentation", desc: "8 slides. The headline number, the story, the projection. Built to be shown in the room.", accent: GOLD },
    { key: "compliance", icon: ShieldCheck, title: "Compliance Detail", desc: "Full statistical record — confidence intervals, methodology, every metric. Your file, never shared externally.", accent: STEEL },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:hidden">
      {options.map(opt => {
        const active = mode === opt.key;
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className="text-left rounded-2xl p-5 transition-all"
            style={{
              background: active ? `${opt.accent}12` : "#111118",
              border: `1.5px solid ${active ? `${opt.accent}55` : "rgba(255,255,255,0.08)"}`,
            }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${opt.accent}18`, border: `1px solid ${opt.accent}40` }}>
                <Icon size={15} style={{ color: opt.accent }} />
              </div>
              <span className="text-sm font-bold text-white">{opt.title}</span>
              {active && (
                <span className="ml-auto text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ background: `${opt.accent}20`, color: opt.accent }}>
                  Viewing
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{opt.desc}</p>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide deck navigator
// ═══════════════════════════════════════════════════════════════════════════════

export function SlideDeck({
  d, mode, firmName,
}: {
  d: Diagnostic;
  mode: ReportMode;
  firmName: string;
}) {
  const accent = modeAccent(mode);
  const slides = mode === "prospect" ? buildProspectSlides(d) : buildComplianceSlides(d);
  const [index, setIndex] = useState(0);

  useEffect(() => { setIndex(0); }, [mode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setIndex(i => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft")  setIndex(i => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div id="report" className="space-y-3">

      {/* ── Nav chrome ── */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <button
          onClick={() => setIndex(i => Math.max(i - 1, 0))}
          disabled={index === 0}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-mono transition-all disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: MUTED }}
        >
          <ChevronLeft size={13} /> Prev
        </button>

        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setIndex(i)}
                aria-label={s.eyebrow}
                className="rounded-full transition-all"
                style={{
                  width: i === index ? 22 : 6, height: 6,
                  background: i === index ? accent : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>
          <span className="text-[11px] font-mono ml-2" style={{ color: MUTED }}>
            {index + 1} / {slides.length} · {slides[index].eyebrow}
          </span>
        </div>

        <button
          onClick={() => setIndex(i => Math.min(i + 1, slides.length - 1))}
          disabled={index === slides.length - 1}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-mono transition-all disabled:opacity-30"
          style={{ background: `${accent}12`, border: `1px solid ${accent}35`, color: accent }}
        >
          Next <ChevronRight size={13} />
        </button>
      </div>

      {/* ── Slides — all rendered; screen shows one, print shows all ── */}
      {slides.map((s, i) => (
        <div key={s.id} className={`slide-page ${i === index ? "slide-active" : ""}`}>
          {s.node}
          <SlideFooter firmName={firmName} mode={mode} index={i + 1} total={slides.length} accent={accent} />
        </div>
      ))}

      <style>{`
        @media screen {
          .slide-page { display: none; }
          .slide-page.slide-active { display: block; animation: slideIn 0.18s ease-out; }
        }
        @keyframes slideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @media print {
          .slide-page { display: block !important; page-break-after: always; break-after: page; }
          .slide-page:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}
