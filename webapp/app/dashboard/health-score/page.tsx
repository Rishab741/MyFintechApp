"use client";
import { getJwt } from "@/lib/jwt";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { engine, HealthScoreBreakdown } from "@/lib/engine";
import { Lightbulb, RefreshCw } from "lucide-react";



function useHealthScore() {
  return useSWR("health-score-detail", async () => {
    const jwt = await getJwt();
    return engine.portfolio.healthScore(jwt);
  });
}

// ── Score ring (SVG) ──────────────────────────────────────────────────────────
function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius = 72;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const gradeColor =
    grade === "A" ? "#22c55e" :
    grade === "B" ? "#86efac" :
    grade === "C" ? "#eab308" :
    grade === "D" ? "#f97316" :
                    "#ef4444";

  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={180} className="-rotate-90">
        <circle cx={90} cy={90} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={90} cy={90} r={radius}
          fill="none"
          stroke={gradeColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="-mt-[108px] flex flex-col items-center z-10">
        <span className="text-5xl font-bold text-white">{score}</span>
        <span className="text-sm text-muted">out of 100</span>
        <span className="text-2xl font-bold mt-1" style={{ color: gradeColor }}>{grade}</span>
      </div>
      <div className="mt-4" />
    </div>
  );
}

// ── Breakdown bar ─────────────────────────────────────────────────────────────
function BreakdownBar({ label, value, max, color = "bg-accent" }: {
  label: string; value: number; max: number; color?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-muted">{label}</span>
        <span className="text-white font-medium">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const BREAKDOWN_CONFIG: { key: keyof HealthScoreBreakdown; label: string; max: number; color: string }[] = [
  { key: "diversification",    label: "Diversification",    max: 30, color: "bg-blue-400"   },
  { key: "risk_return",        label: "Risk-Return (Sharpe)",max: 25, color: "bg-accent"     },
  { key: "drawdown_resilience",label: "Drawdown Resilience", max: 25, color: "bg-purple-400" },
  { key: "consistency",        label: "Daily Consistency",   max: 10, color: "bg-yellow-400" },
  { key: "cash_efficiency",    label: "Cash Efficiency",     max: 10, color: "bg-emerald-400"},
];

export default function HealthScorePage() {
  const { data, isLoading, mutate } = useHealthScore();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Portfolio Health Score</h1>
          <p className="text-sm text-muted mt-0.5">
            A composite 0-100 score across diversification, risk, drawdowns, consistency, and cash efficiency
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-xl p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      ) : data ? (
        <>
          {/* Score + breakdown side by side */}
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col md:flex-row gap-8 items-center">
            <ScoreRing score={data.score} grade={data.grade} />

            <div className="flex-1 w-full space-y-4">
              {BREAKDOWN_CONFIG.map(({ key, label, max, color }) => (
                <BreakdownBar
                  key={key}
                  label={label}
                  value={data.breakdown[key]}
                  max={max}
                  color={color}
                />
              ))}
            </div>
          </div>

          {/* Insights */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb size={14} className="text-yellow-400" />
              <h2 className="text-sm font-medium text-white">Insights</h2>
            </div>
            {data.insights.map((insight, i) => (
              <div key={i} className="flex gap-3 text-sm text-muted">
                <span className="text-accent font-bold shrink-0 mt-0.5">·</span>
                <span>{insight}</span>
              </div>
            ))}
          </div>

          {/* Grade scale legend */}
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted mb-3 font-medium">Grade scale</p>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              {[
                { grade: "A", range: "80–100", color: "text-green-400" },
                { grade: "B", range: "65–79",  color: "text-green-300" },
                { grade: "C", range: "50–64",  color: "text-yellow-400"},
                { grade: "D", range: "35–49",  color: "text-orange-400"},
                { grade: "F", range: "0–34",   color: "text-red-400"   },
              ].map(({ grade, range, color }) => (
                <div key={grade} className={`${grade === data.grade ? "bg-white/5 rounded-lg py-1" : ""}`}>
                  <p className={`font-bold text-base ${color}`}>{grade}</p>
                  <p className="text-muted">{range}</p>
                </div>
              ))}
            </div>
          </div>

          {data.computed_at && (
            <p className="text-xs text-muted text-right">
              Computed {new Date(data.computed_at).toLocaleString()}
            </p>
          )}
        </>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted text-sm">
          No portfolio data found. Import holdings first.
        </div>
      )}
    </div>
  );
}
