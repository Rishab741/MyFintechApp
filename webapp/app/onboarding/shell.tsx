"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";

const STEPS = [
  { key: "verify-email", label: "Verify Email",   path: "/onboarding/verify-email" },
  { key: "mfa",          label: "Security",        path: "/onboarding/mfa"          },
  { key: "workspace",    label: "Workspace",       path: "/onboarding/workspace"    },
  { key: "connect",      label: "Connect",         path: "/onboarding/connect"      },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 w-full max-w-xs mx-auto">
      {STEPS.map((step, i) => {
        const done    = i < current;
        const active  = i === current;
        const last    = i === STEPS.length - 1;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-bold transition-all ${
                  done
                    ? "bg-accent border-accent text-white"
                    : active
                    ? "bg-transparent border-accent text-accent"
                    : "bg-transparent border-white/15 text-slate-600"
                }`}
              >
                {done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </div>
              <span
                className={`text-[10px] font-medium tracking-wide whitespace-nowrap ${
                  active ? "text-white" : done ? "text-accent" : "text-slate-600"
                }`}
              >
                {step.label}
              </span>
            </div>
            {/* Connector line */}
            {!last && (
              <div className={`h-px flex-1 mx-2 mb-4 transition-colors ${done ? "bg-accent" : "bg-white/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Derive the active step index from the current URL
  const stepIndex = STEPS.findIndex((s) => pathname.startsWith(s.path));
  const current   = stepIndex >= 0 ? stepIndex : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-12 pb-16 px-4">
      {/* Brand */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent shrink-0">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2.5}>
            <path d="M3 3v18h18" /><path d="m7 16 4-4 4 4 5-5" />
          </svg>
        </div>
        <span className="font-semibold text-white text-lg">Platstock</span>
      </div>

      {/* Progress stepper */}
      {stepIndex >= 0 && (
        <div className="w-full max-w-md mb-10">
          <StepIndicator current={current} />
        </div>
      )}

      {/* Page content */}
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
