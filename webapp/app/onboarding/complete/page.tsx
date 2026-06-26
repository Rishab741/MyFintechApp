"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BarChart2, GitBranch, Sparkles } from "lucide-react";

export default function CompletePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const next         = searchParams.get("next"); // e.g. "ingest" for CSV flow
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-redirect after 3 seconds
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      router.push(next === "ingest" ? "/dashboard/ingest" : "/dashboard");
    }, 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [next, router]);

  return (
    <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Animated checkmark ring */}
      <div className="flex items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-accent/15 border-2 border-accent">
            <svg viewBox="0 0 24 24" fill="none" className="w-9 h-9 text-accent" stroke="currentColor" strokeWidth={2.5}>
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-white">You&apos;re all set!</h2>
        <p className="text-slate-400 text-sm mt-2">
          Your Platstock workspace is ready. Taking you to the dashboard…
        </p>
      </div>

      {/* Feature preview */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { icon: BarChart2,  label: "Portfolio Analytics", color: "#8FF5FF" },
          { icon: Sparkles,   label: "ML Insights",         color: "#AC89FF" },
          { icon: GitBranch,  label: "Counterfactual Sim",  color: "#F59E0B" },
        ].map(({ icon: Icon, label, color }) => (
          <div key={label} className="bg-[#161b22] border border-white/8 rounded-xl p-4">
            <Icon size={20} className="mx-auto mb-2" style={{ color }} />
            <p className="text-[11px] text-slate-400 font-medium leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Manual CTA */}
      <button
        onClick={() => router.push(next === "ingest" ? "/dashboard/ingest" : "/dashboard")}
        className="flex items-center gap-2 mx-auto text-sm text-accent hover:text-white transition-colors"
      >
        Go to dashboard
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
