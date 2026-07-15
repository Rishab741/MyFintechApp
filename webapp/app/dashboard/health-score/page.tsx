"use client";

import useSWR from "swr";
import { engine, HealthScoreBreakdown } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import { Lightbulb, RefreshCw } from "lucide-react";
import { DataGate } from "@/components/data-gate";

function useHealthScore() {
  return useSWR("health-score-detail", async () => engine.portfolio.healthScore(await getJwt()));
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius      = 80;
  const stroke      = 10;
  const circumf     = 2 * Math.PI * radius;
  const offset      = circumf - (score / 100) * circumf;

  const gradeColor =
    grade === "A" ? "#10B981" :
    grade === "B" ? "#34D399" :
    grade === "C" ? "#F59E0B" :
    grade === "D" ? "#F97316" :
                    "#EF4444";

  return (
    <div className="relative flex flex-col items-center shrink-0">
      <svg width={196} height={196} className="-rotate-90">
        {/* Track */}
        <circle cx={98} cy={98} r={radius}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {/* Glow ring */}
        <circle cx={98} cy={98} r={radius}
          fill="none" stroke={gradeColor} strokeWidth={stroke + 4}
          strokeDasharray={circumf} strokeDashoffset={offset}
          strokeLinecap="round" opacity={0.15} />
        {/* Fill ring */}
        <circle cx={98} cy={98} r={radius}
          fill="none" stroke={gradeColor} strokeWidth={stroke}
          strokeDasharray={circumf} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease, stroke 0.5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[52px] font-bold text-white leading-none">{score}</span>
        <span className="text-sm text-[#6B7280] mt-0.5">out of 100</span>
        <span className="text-[22px] font-bold mt-2" style={{ color: gradeColor }}>{grade}</span>
      </div>
    </div>
  );
}

const BREAKDOWN_CONFIG: {
  key: keyof HealthScoreBreakdown;
  label: string;
  max: number;
  color: string;
  description: string;
}[] = [
  { key: "diversification",    label: "Diversification",    max: 30, color: "#8B5CF6", description: "Asset & sector spread" },
  { key: "risk_return",        label: "Risk-Return",        max: 25, color: "#10B981", description: "Sharpe ratio quality"  },
  { key: "drawdown_resilience",label: "Drawdown Resilience",max: 25, color: "#3B82F6", description: "Max DD mitigation"     },
  { key: "consistency",        label: "Consistency",        max: 10, color: "#F59E0B", description: "Daily return stability" },
  { key: "cash_efficiency",    label: "Cash Efficiency",    max: 10, color: "#EC4899", description: "Idle cash utilisation"  },
];

const GRADE_SCALE = [
  { grade: "A", range: "80–100", color: "#10B981" },
  { grade: "B", range: "65–79",  color: "#34D399" },
  { grade: "C", range: "50–64",  color: "#F59E0B" },
  { grade: "D", range: "35–49",  color: "#F97316" },
  { grade: "F", range: "0–34",   color: "#EF4444" },
];

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-white/5 rounded animate-pulse ${className}`} />;
}

export default function HealthScorePage() {
  const { data, isLoading, mutate } = useHealthScore();

  return (
    <DataGate description="Your portfolio health score and dimension breakdown across diversification, risk-return, drawdown resilience, consistency, and cash efficiency will appear here.">
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-white">Portfolio Health</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Composite 0–100 score across five dimensions
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-white transition-colors px-3 py-2 rounded-lg border"
          style={{ borderColor: "#1A1A28" }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-xl p-8 flex flex-col md:flex-row gap-8 items-center"
          style={{ background: "#111118", border: "1px solid #1A1A28" }}>
          <Skeleton className="w-[196px] h-[196px] rounded-full shrink-0" />
          <div className="flex-1 w-full space-y-5">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10" />)}
          </div>
        </div>
      ) : data ? (
        <>
          {/* Score + breakdown */}
          <div className="rounded-xl p-6 flex flex-col md:flex-row gap-8 items-center"
            style={{ background: "#111118", border: "1px solid #1A1A28" }}>
            <ScoreRing score={data.score} grade={data.grade} />
            <div className="flex-1 w-full space-y-5">
              {BREAKDOWN_CONFIG.map(({ key, label, max, color, description }) => {
                const value = data.breakdown[key];
                const pct   = Math.min((value / max) * 100, 100);
                return (
                  <div key={key}>
                    <div className="flex justify-between items-baseline mb-2">
                      <div>
                        <span className="text-sm text-white font-medium">{label}</span>
                        <span className="text-[11px] text-[#4B5563] ml-2">{description}</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums" style={{ color }}>
                        {value.toFixed(1)}<span className="text-[#4B5563] font-normal"> / {max}</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Insights */}
          <div className="rounded-xl p-5" style={{ background: "#111118", border: "1px solid #1A1A28" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: "rgba(245,158,11,0.1)" }}>
                <Lightbulb size={13} style={{ color: "#F59E0B" }} />
              </div>
              <h2 className="text-sm font-semibold text-white">Insights</h2>
            </div>
            <div className="space-y-3">
              {data.insights.map((insight, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-accent font-bold shrink-0 mt-0.5 select-none">·</span>
                  <span className="text-[#9CA3AF] leading-relaxed">{insight}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Grade legend */}
          <div className="rounded-xl p-5" style={{ background: "#111118", border: "1px solid #1A1A28" }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5563] mb-4">Grade scale</p>
            <div className="grid grid-cols-5 gap-3 text-center">
              {GRADE_SCALE.map(({ grade, range, color }) => (
                <div
                  key={grade}
                  className="rounded-lg py-3 transition-all"
                  style={
                    grade === data.grade
                      ? { background: `${color}14`, border: `1px solid ${color}30` }
                      : { border: "1px solid transparent" }
                  }
                >
                  <p className="text-[20px] font-bold" style={{ color }}>{grade}</p>
                  <p className="text-[11px] text-[#4B5563] mt-0.5">{range}</p>
                </div>
              ))}
            </div>
          </div>

          {data.computed_at && (
            <p className="text-xs text-[#4B5563] text-right">
              Computed {new Date(data.computed_at).toLocaleString()}
            </p>
          )}
        </>
      ) : (
        <div className="rounded-xl p-10 text-center text-[#4B5563] text-sm"
          style={{ background: "#111118", border: "1px solid #1A1A28" }}>
          No portfolio data — import holdings to generate a health score.
        </div>
      )}
    </div>
    </DataGate>
  );
}
