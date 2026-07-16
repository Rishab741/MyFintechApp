"use client";

import { useState, useId } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Building2, Check, ChevronLeft, ChevronRight,
  Eye, EyeOff, Loader2, Mail, X,
} from "lucide-react";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const A        = "#C9A84C";
const A_BG     = "rgba(201,168,76,0.08)";
const A_BORDER = "rgba(201,168,76,0.18)";
const CARD_BG  = "#111118";
const CARD_BD  = "#1E1E2E";
const INPUT_CLS =
  "w-full text-sm text-white placeholder-[#4B5563] rounded-lg px-3.5 py-3 " +
  "focus:outline-none transition-colors bg-[#0A0A0F]";

// ── Password security ─────────────────────────────────────────────────────────
const PW_REQS = [
  { label: "At least 12 characters",  test: (p: string) => p.length >= 12 },
  { label: "Uppercase letter (A–Z)",  test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter (a–z)",  test: (p: string) => /[a-z]/.test(p) },
  { label: "Number (0–9)",            test: (p: string) => /[0-9]/.test(p) },
  { label: "Special character",       test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;
const STRENGTH_LABEL = ["", "Very weak", "Weak", "Fair", "Strong", "Very strong"];
const STRENGTH_COLOR = ["", "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#10B981"];
function pwStrength(p: string) {
  return PW_REQS.filter(r => r.test(p)).length as 0 | 1 | 2 | 3 | 4 | 5;
}

// ── Option pills ──────────────────────────────────────────────────────────────
function Pills({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value:   string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-3.5 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: active ? A_BG     : "rgba(255,255,255,0.03)",
              border:     `1px solid ${active ? A_BORDER : "rgba(255,255,255,0.08)"}`,
              color:      active ? A        : "#9CA3AF",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({
  label,
  htmlFor,
  children,
}: {
  label:   string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function inputBorder(active = false) {
  return { border: `1px solid ${active ? A_BORDER : CARD_BD}` };
}

// ── Step progress bar ─────────────────────────────────────────────────────────
const STEP_LABELS = ["Account", "Your Firm", "Your Role", "Review"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEP_LABELS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            {/* Node */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{
                  background: done || active ? A_BG     : "rgba(255,255,255,0.04)",
                  border:     `1.5px solid ${done || active ? A_BORDER : "rgba(255,255,255,0.1)"}`,
                  color:      done || active ? A        : "#4B5563",
                }}
              >
                {done ? <Check size={12} style={{ color: A }} /> : i + 1}
              </div>
              <span
                className="text-[10px] mt-1 font-medium whitespace-nowrap"
                style={{ color: active ? A : done ? "#9CA3AF" : "#4B5563" }}
              >
                {label}
              </span>
            </div>
            {/* Connector */}
            {i < STEP_LABELS.length - 1 && (
              <div
                className="flex-1 h-px mx-2 mb-3 transition-all"
                style={{ background: i < current ? A_BORDER : "rgba(255,255,255,0.07)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Summary row ───────────────────────────────────────────────────────────────
function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-b-0"
      style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      <span className="text-[#6B7280] text-xs">{label}</span>
      <span className="text-white text-xs font-medium text-right max-w-[55%]">{value}</span>
    </div>
  );
}

// ── Verify sent screen ────────────────────────────────────────────────────────
function VerifySent({ email }: { email: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 600px 300px at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)" }} />
      <div className="relative w-full max-w-sm text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
          style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}>
          <Mail size={28} style={{ color: A }} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Verify your email</h2>
          <p className="text-[#6B7280] text-sm mt-2 leading-relaxed">
            We sent a confirmation link to{" "}
            <span className="text-white font-medium">{email}</span>.
            Click it to activate your advisor account.
          </p>
        </div>
        <p className="text-xs text-[#4B5563]">
          The link expires in 24 hours. Check your spam folder if it doesn&apos;t appear.
        </p>
        <Link href="/advisor/login" className="text-sm font-medium hover:underline" style={{ color: A }}>
          Back to sign in →
        </Link>
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function AdvisorSignup() {
  const supabase = createClient();
  const uid      = useId();

  const [step, setStep] = useState(0);   // 0..3

  // ── Step 0: credentials ───────────────────────────────────────────────────
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [showCon,  setShowCon]  = useState(false);

  // ── Step 1: firm profile ──────────────────────────────────────────────────
  const [firmName,  setFirmName]  = useState("");
  const [firmType,  setFirmType]  = useState("");
  const [aumRange,  setAumRange]  = useState("");
  const [teamSize,  setTeamSize]  = useState("");

  // ── Step 2: personal role ─────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [jobTitle,  setJobTitle]  = useState("");
  const [useCase,   setUseCase]   = useState("");

  // ── Step 3: terms + submit ────────────────────────────────────────────────
  const [agreed,   setAgreed]   = useState(false);

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  // Derived password state
  const strength = pwStrength(password);
  const pwMet    = PW_REQS.map(r => r.test(password));
  const allPwMet = pwMet.every(Boolean);
  const pwMatch  = password.length > 0 && confirm.length > 0 && password === confirm;
  const pwBad    = confirm.length > 0 && !pwMatch;

  // ── Step validators ────────────────────────────────────────────────────────
  function step0Valid() { return !!email && allPwMet && pwMatch; }
  function step1Valid() { return firmName.trim().length >= 2 && !!firmType && !!aumRange && !!teamSize; }
  function step2Valid() { return !!firstName.trim() && !!lastName.trim() && !!jobTitle.trim() && !!useCase; }
  function step3Valid() { return agreed; }

  function canAdvance() {
    if (step === 0) return step0Valid();
    if (step === 1) return step1Valid();
    if (step === 2) return step2Valid();
    return step3Valid();
  }

  function next() {
    setError("");
    if (step < 3 && canAdvance()) setStep(s => s + 1);
  }
  function back() {
    setError("");
    if (step > 0) setStep(s => s - 1);
  }

  // ── Submit (step 3) ────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!step3Valid()) { setError("Please accept the Terms of Service to continue."); return; }
    setLoading(true);
    setError("");
    try {
      const { data, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/advisor-callback`,
          // All onboarding data flows through user_metadata — read server-side
          // in /auth/advisor-callback to create the advisor_firms row.
          data: {
            firm_name:           firmName.trim(),
            firm_type:           firmType,
            aum_range:           aumRange,
            team_size:           teamSize,
            contact_first_name:  firstName.trim(),
            contact_last_name:   lastName.trim(),
            job_title:           jobTitle.trim(),
            primary_use_case:    useCase,
          },
        },
      });
      if (authErr) throw authErr;
      if (data.user && !data.session) {
        setSent(true);
      } else if (data.session) {
        // Auto-confirm flow (no verification email): the advisor-callback
        // route never runs, so provision the role server-side before entering.
        await fetch("/api/advisor/provision", { method: "POST" });
        await supabase.auth.refreshSession();
        window.location.href = "/advisor/dashboard";
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Signup failed. Please try again.";
      setError(
        msg.toLowerCase().includes("already registered")
          ? "An account with this email already exists. Try signing in instead."
          : msg
      );
    } finally {
      setLoading(false);
    }
  }

  if (sent) return <VerifySent email={email} />;

  // ── Human-readable labels for the review step ──────────────────────────────
  const FIRM_TYPE_LABEL: Record<string, string> = {
    ria:          "Registered Investment Advisor (RIA)",
    bd:           "Registered Broker-Dealer",
    family_office:"Family Office",
    mfo:          "Multi-Family Office",
    independent:  "Independent Advisor",
    other:        "Other",
  };
  const AUM_LABEL: Record<string, string> = {
    under_50m: "Under $50M AUM",
    "50m_250m": "$50M – $250M AUM",
    "250m_1b":  "$250M – $1B AUM",
    over_1b:   "Over $1B AUM",
  };
  const TEAM_LABEL: Record<string, string> = {
    solo:    "Just me",
    "2_5":   "2–5 advisors",
    "6_20":  "6–20 advisors",
    over_20: "20+ advisors",
  };
  const USE_CASE_LABEL: Record<string, string> = {
    prospect_presentations: "Prospect presentations",
    client_reviews:         "Client portfolio reviews",
    retention_analysis:     "Retention & engagement analysis",
    compliance_reporting:   "Compliance reporting",
    other:                  "Other",
  };

  return (
    <div className="min-h-screen flex bg-[#0A0A0F] overflow-hidden">

      {/* ── Background ──────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 800px 500px at 40% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)" }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.13]"
        style={{ backgroundImage: "radial-gradient(circle, #2A2A1A 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-center px-16 w-[40%] shrink-0">
        <div className="max-w-[360px]">
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}>
              <Building2 size={15} style={{ color: A }} />
            </div>
            <span className="text-white font-semibold text-[15px]">Platstock Advisor</span>
          </div>
          <h1 className="text-[38px] font-semibold text-white leading-[1.1] tracking-tight mb-4">
            Institutional-grade<br />behavioral analytics.
          </h1>
          <p className="text-[#9CA3AF] text-[15px] leading-relaxed mb-10">
            Help your clients understand the hidden cost of emotional trading decisions — with data they can&apos;t dismiss.
          </p>
          <div className="space-y-4">
            {[
              ["Free to start",      "5 client diagnostics per month, no credit card"],
              ["Zero data retained", "CSVs processed in-memory, nothing stored"],
              ["Print-ready PDFs",   "White-label reports branded with your firm"],
              ["Setup in 3 minutes", "Upload a CSV, get a full audit in seconds"],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full mt-0.5 flex items-center justify-center shrink-0"
                  style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}>
                  <Check size={10} style={{ color: A }} />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{title}</p>
                  <p className="text-[#6B7280] text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel — wizard ─────────────────────────────────────────── */}
      <div className="relative flex-1 flex items-start justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-[460px]">

          {/* Mobile brand */}
          <div className="flex items-center gap-2 justify-center mb-8 lg:hidden">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}>
              <Building2 size={13} style={{ color: A }} />
            </div>
            <span className="text-white font-semibold text-sm">Platstock Advisor</span>
          </div>

          <div className="rounded-2xl p-8" style={{
            background: CARD_BG,
            border:     `1px solid ${CARD_BD}`,
            boxShadow:  "0 0 0 1px rgba(201,168,76,0.04), 0 24px 48px rgba(0,0,0,0.4)",
          }}>
            {/* Step progress */}
            <StepBar current={step} />

            <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); next(); }}
              className="space-y-5" noValidate>

              {/* ── STEP 0: Account credentials ──────────────────────── */}
              {step === 0 && (
                <>
                  <div className="mb-1">
                    <h2 className="text-[18px] font-semibold text-white">Create your account</h2>
                    <p className="text-[#6B7280] text-sm mt-1">Start with a secure login for your advisor portal.</p>
                  </div>

                  {/* Email */}
                  <Field label="Work email" htmlFor={`${uid}-email`}>
                    <input
                      id={`${uid}-email`}
                      type="email" required value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@yourfirm.com"
                      autoComplete="email"
                      className={INPUT_CLS}
                      style={inputBorder()}
                      onFocus={e => (e.target.style.borderColor = A_BORDER)}
                      onBlur={e  => (e.target.style.borderColor = CARD_BD)}
                    />
                  </Field>

                  {/* Password */}
                  <div>
                    <label htmlFor={`${uid}-pw`}
                      className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id={`${uid}-pw`}
                        type={showPw ? "text" : "password"} required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        className={`${INPUT_CLS} pr-10`}
                        style={inputBorder()}
                        onFocus={e => (e.target.style.borderColor = A_BORDER)}
                        onBlur={e  => (e.target.style.borderColor = CARD_BD)}
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors">
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {/* Strength bar */}
                    {password.length > 0 && (
                      <div className="mt-2.5 space-y-2">
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                              style={{ background: i <= strength ? STRENGTH_COLOR[strength] : "rgba(255,255,255,0.06)" }} />
                          ))}
                        </div>
                        <p className="text-xs font-medium" style={{ color: STRENGTH_COLOR[strength] || "#4B5563" }}>
                          {STRENGTH_LABEL[strength]}
                        </p>
                        <div className="space-y-1.5">
                          {PW_REQS.map((req, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all"
                                style={{
                                  background: pwMet[i] ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
                                  border:     `1px solid ${pwMet[i] ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.07)"}`,
                                }}>
                                {pwMet[i] ? <Check size={8} className="text-emerald-400" /> : <X size={8} className="text-[#374151]" />}
                              </div>
                              <span className="text-xs transition-colors" style={{ color: pwMet[i] ? "#10B981" : "#6B7280" }}>
                                {req.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label htmlFor={`${uid}-con`}
                      className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide">
                      Confirm password
                    </label>
                    <div className="relative">
                      <input
                        id={`${uid}-con`}
                        type={showCon ? "text" : "password"} required
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        placeholder="••••••••••••"
                        autoComplete="new-password"
                        className={`${INPUT_CLS} pr-10`}
                        style={{ border: `1px solid ${pwBad ? "rgba(239,68,68,0.4)" : pwMatch ? "rgba(16,185,129,0.3)" : CARD_BD}` }}
                        onFocus={e => (e.target.style.borderColor = A_BORDER)}
                        onBlur={e  => (e.target.style.borderColor = pwBad ? "rgba(239,68,68,0.4)" : pwMatch ? "rgba(16,185,129,0.3)" : CARD_BD)}
                      />
                      <button type="button" onClick={() => setShowCon(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors">
                        {showCon ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {confirm.length > 0 && (
                      <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: pwMatch ? "#10B981" : "#EF4444" }}>
                        {pwMatch ? <Check size={10} /> : <X size={10} />}
                        {pwMatch ? "Passwords match" : "Passwords do not match"}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* ── STEP 1: Firm profile ─────────────────────────────── */}
              {step === 1 && (
                <>
                  <div className="mb-1">
                    <h2 className="text-[18px] font-semibold text-white">Tell us about your firm</h2>
                    <p className="text-[#6B7280] text-sm mt-1">This appears on your white-label reports and helps us tailor the experience.</p>
                  </div>

                  <Field label="Firm legal name" htmlFor={`${uid}-firm`}>
                    <input
                      id={`${uid}-firm`}
                      type="text" required value={firmName}
                      onChange={e => setFirmName(e.target.value)}
                      placeholder="Acme Wealth Management LLC"
                      autoComplete="organization"
                      minLength={2} maxLength={200}
                      className={INPUT_CLS}
                      style={inputBorder()}
                      onFocus={e => (e.target.style.borderColor = A_BORDER)}
                      onBlur={e  => (e.target.style.borderColor = CARD_BD)}
                    />
                  </Field>

                  <div>
                    <label className="block text-[#9CA3AF] text-xs font-medium mb-2 uppercase tracking-wide">
                      Firm type
                    </label>
                    <Pills
                      value={firmType}
                      onChange={setFirmType}
                      options={[
                        { value: "ria",          label: "RIA" },
                        { value: "bd",           label: "Broker-Dealer" },
                        { value: "family_office",label: "Family Office" },
                        { value: "mfo",          label: "Multi-Family Office" },
                        { value: "independent",  label: "Independent" },
                        { value: "other",        label: "Other" },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-[#9CA3AF] text-xs font-medium mb-2 uppercase tracking-wide">
                      Assets under management
                    </label>
                    <Pills
                      value={aumRange}
                      onChange={setAumRange}
                      options={[
                        { value: "under_50m", label: "Under $50M" },
                        { value: "50m_250m",  label: "$50M – $250M" },
                        { value: "250m_1b",   label: "$250M – $1B" },
                        { value: "over_1b",   label: "Over $1B" },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-[#9CA3AF] text-xs font-medium mb-2 uppercase tracking-wide">
                      Team size
                    </label>
                    <Pills
                      value={teamSize}
                      onChange={setTeamSize}
                      options={[
                        { value: "solo",    label: "Just me" },
                        { value: "2_5",     label: "2–5" },
                        { value: "6_20",    label: "6–20" },
                        { value: "over_20", label: "20+" },
                      ]}
                    />
                  </div>
                </>
              )}

              {/* ── STEP 2: Personal role ────────────────────────────── */}
              {step === 2 && (
                <>
                  <div className="mb-1">
                    <h2 className="text-[18px] font-semibold text-white">Your role at the firm</h2>
                    <p className="text-[#6B7280] text-sm mt-1">Personalises your dashboard and report templates.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" htmlFor={`${uid}-fn`}>
                      <input
                        id={`${uid}-fn`}
                        type="text" required value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="Jane"
                        autoComplete="given-name"
                        className={INPUT_CLS}
                        style={inputBorder()}
                        onFocus={e => (e.target.style.borderColor = A_BORDER)}
                        onBlur={e  => (e.target.style.borderColor = CARD_BD)}
                      />
                    </Field>
                    <Field label="Last name" htmlFor={`${uid}-ln`}>
                      <input
                        id={`${uid}-ln`}
                        type="text" required value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder="Smith"
                        autoComplete="family-name"
                        className={INPUT_CLS}
                        style={inputBorder()}
                        onFocus={e => (e.target.style.borderColor = A_BORDER)}
                        onBlur={e  => (e.target.style.borderColor = CARD_BD)}
                      />
                    </Field>
                  </div>

                  <Field label="Job title" htmlFor={`${uid}-jt`}>
                    <input
                      id={`${uid}-jt`}
                      type="text" required value={jobTitle}
                      onChange={e => setJobTitle(e.target.value)}
                      placeholder="Managing Director, Principal, CFP…"
                      autoComplete="organization-title"
                      className={INPUT_CLS}
                      style={inputBorder()}
                      onFocus={e => (e.target.style.borderColor = A_BORDER)}
                      onBlur={e  => (e.target.style.borderColor = CARD_BD)}
                    />
                  </Field>

                  <div>
                    <label className="block text-[#9CA3AF] text-xs font-medium mb-2 uppercase tracking-wide">
                      Primary use case
                    </label>
                    <Pills
                      value={useCase}
                      onChange={setUseCase}
                      options={[
                        { value: "prospect_presentations", label: "Prospect presentations" },
                        { value: "client_reviews",         label: "Client portfolio reviews" },
                        { value: "retention_analysis",     label: "Retention & engagement" },
                        { value: "compliance_reporting",   label: "Compliance reporting" },
                        { value: "other",                  label: "Other" },
                      ]}
                    />
                  </div>
                </>
              )}

              {/* ── STEP 3: Review + terms ───────────────────────────── */}
              {step === 3 && (
                <>
                  <div className="mb-1">
                    <h2 className="text-[18px] font-semibold text-white">Review &amp; confirm</h2>
                    <p className="text-[#6B7280] text-sm mt-1">Check everything looks right before we create your account.</p>
                  </div>

                  {/* Summary */}
                  <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563] mb-3">Account</p>
                    <SummaryRow label="Email"    value={email} />
                    <SummaryRow label="Password" value="••••••••••••" />

                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563] mt-4 mb-3">Firm</p>
                    <SummaryRow label="Firm name" value={firmName} />
                    <SummaryRow label="Type"      value={FIRM_TYPE_LABEL[firmType] ?? firmType} />
                    <SummaryRow label="AUM"       value={AUM_LABEL[aumRange]  ?? aumRange} />
                    <SummaryRow label="Team"      value={TEAM_LABEL[teamSize]  ?? teamSize} />

                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563] mt-4 mb-3">Your role</p>
                    <SummaryRow label="Name"      value={`${firstName} ${lastName}`} />
                    <SummaryRow label="Title"     value={jobTitle} />
                    <SummaryRow label="Use case"  value={USE_CASE_LABEL[useCase] ?? useCase} />
                  </div>

                  {/* Edit links */}
                  <div className="flex gap-4 text-xs">
                    {[["Account", 0], ["Firm", 1], ["Role", 2]].map(([label, s]) => (
                      <button key={s} type="button" onClick={() => setStep(s as number)}
                        className="hover:underline transition-colors" style={{ color: A }}>
                        Edit {label}
                      </button>
                    ))}
                  </div>

                  {/* Terms */}
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={agreed}
                      onClick={() => setAgreed(v => !v)}
                      className="w-4 h-4 mt-0.5 rounded shrink-0 flex items-center justify-center transition-all"
                      style={{
                        background: agreed ? A_BG : "transparent",
                        border:     `1px solid ${agreed ? A : "#2E2E3E"}`,
                      }}
                    >
                      {agreed && <Check size={9} style={{ color: A }} />}
                    </button>
                    <span className="text-xs text-[#6B7280] leading-relaxed">
                      I agree to the{" "}
                      <span className="font-medium cursor-pointer hover:underline" style={{ color: A }}>Terms of Service</span>
                      {" "}and{" "}
                      <span className="font-medium cursor-pointer hover:underline" style={{ color: A }}>Privacy Policy</span>.
                      I confirm I am an authorised representative of {firmName || "the firm above"}.
                    </span>
                  </label>
                </>
              )}

              {/* ── Error ──────────────────────────────────────────────────── */}
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-red-400 text-sm" role="alert"
                  style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)" }}>
                  <X size={14} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* ── Navigation ─────────────────────────────────────────────── */}
              <div className={`flex gap-3 pt-1 ${step === 0 ? "justify-end" : "justify-between"}`}>
                {step > 0 && (
                  <button
                    type="button"
                    onClick={back}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border:     "1px solid rgba(255,255,255,0.08)",
                      color:      "#9CA3AF",
                    }}
                  >
                    <ChevronLeft size={15} />
                    Back
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!canAdvance() || loading}
                  className="flex-1 flex items-center justify-center gap-2 text-[#0A0A0F] text-sm font-semibold rounded-xl py-2.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: A,
                    boxShadow:  loading || !canAdvance() ? "none" : "0 0 20px rgba(201,168,76,0.20)",
                  }}
                >
                  {loading && <Loader2 size={15} className="animate-spin" />}
                  {loading
                    ? "Creating account…"
                    : step < 3
                    ? <><span>Continue</span><ChevronRight size={15} /></>
                    : "Create advisor account"
                  }
                </button>
              </div>
            </form>

            <p className="text-center mt-5 text-sm text-[#6B7280]">
              Already have an account?{" "}
              <Link href="/advisor/login" className="font-medium hover:underline" style={{ color: A }}>
                Sign in →
              </Link>
            </p>
          </div>

          <p className="text-center mt-4 text-xs text-[#374151]">
            Not an advisor?{" "}
            <Link href="/" className="underline hover:text-[#6B7280] transition-colors">
              Go to Platstock retail login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
