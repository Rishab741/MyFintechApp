"use client";

import { useState, useId } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Building2, Check, Eye, EyeOff, Loader2, Mail, X,
} from "lucide-react";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const A = "#C9A84C";                      // advisor gold accent
const A_BG     = "rgba(201,168,76,0.08)";
const A_BORDER = "rgba(201,168,76,0.18)";
const CARD_BG  = "#111118";
const CARD_BD  = "#1E1E2E";

// ── Password requirements ─────────────────────────────────────────────────────
// Each requirement is independently tested so the strength bar and checklist
// can update in real-time as the user types.
const PW_REQUIREMENTS = [
  { label: "At least 12 characters",  test: (p: string) => p.length >= 12 },
  { label: "Uppercase letter (A–Z)",  test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter (a–z)",  test: (p: string) => /[a-z]/.test(p) },
  { label: "Number (0–9)",            test: (p: string) => /[0-9]/.test(p) },
  { label: "Special character",       test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

const STRENGTH_LABEL = ["", "Very weak", "Weak", "Fair", "Strong", "Very strong"];
const STRENGTH_COLOR = ["", "#EF4444",   "#F97316", "#F59E0B", "#84CC16", "#10B981"];

function pwStrength(pw: string) {
  return PW_REQUIREMENTS.filter(r => r.test(pw)).length as 0 | 1 | 2 | 3 | 4 | 5;
}

// ── Shared input style ────────────────────────────────────────────────────────
const INPUT_CLS =
  "w-full text-sm text-white placeholder-[#4B5563] rounded-lg px-3.5 py-3 " +
  "focus:outline-none transition-colors bg-[#0A0A0F]";

function useInputBorder() {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) =>
      (e.target.style.borderColor = A_BORDER),
    onBlur: (e: React.FocusEvent<HTMLInputElement>) =>
      (e.target.style.borderColor = CARD_BD),
  };
}

// ── VerifySent screen ─────────────────────────────────────────────────────────
function VerifySent({ email }: { email: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 600px 300px at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)",
        }}
      />
      <div className="relative w-full max-w-sm text-center space-y-6">
        <div
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
          style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
        >
          <Mail size={28} style={{ color: A }} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Verify your email</h2>
          <p className="text-[#6B7280] text-sm mt-2 leading-relaxed">
            We sent a confirmation link to{" "}
            <span className="text-white font-medium">{email}</span>.
            Click it to activate your advisor account and set your firm&apos;s role.
          </p>
        </div>
        <p className="text-xs text-[#4B5563]">
          The link expires in 24 hours. Check your spam folder if it doesn&apos;t appear.
        </p>
        <Link
          href="/advisor/login"
          className="text-sm font-medium hover:underline"
          style={{ color: A }}
        >
          Back to sign in →
        </Link>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdvisorSignup() {
  const supabase = createClient();
  const uid      = useId();

  const [firmName,  setFirmName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [showCon,   setShowCon]   = useState(false);
  const [agreed,    setAgreed]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [sent,      setSent]      = useState(false);

  const border = useInputBorder();
  const strength  = pwStrength(password);
  const pwMet     = PW_REQUIREMENTS.map(r => r.test(password));
  const allPwMet  = pwMet.every(Boolean);
  const pwMatch   = password.length > 0 && confirm.length > 0 && password === confirm;
  const pwNoMatch = confirm.length > 0 && !pwMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!allPwMet) {
      setError("Password does not meet all requirements.");
      return;
    }
    if (!pwMatch) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreed) {
      setError("Please accept the Terms of Service to continue.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // advisor-callback sets app_metadata.role server-side after verification.
          emailRedirectTo: `${location.origin}/auth/advisor-callback`,
          // firm_name stored in user_metadata — read in the callback to create the firm record.
          data: { firm_name: firmName.trim() },
        },
      });

      if (authErr) throw authErr;

      if (data.user && !data.session) {
        // Standard flow: email verification required.
        setSent(true);
      } else if (data.session) {
        // Edge case: Supabase instance has email verification disabled.
        // Redirect to dashboard — the callback will not run, so we'd need to
        // handle provisioning here. For safety, reload to let middleware decide.
        window.location.href = "/advisor/dashboard";
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Signup failed. Please try again.";
      // Don't leak "User already registered" — normalise to a safe message.
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

  return (
    <div className="min-h-screen flex bg-[#0A0A0F] overflow-hidden">

      {/* ── Background ────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 800px 500px at 40% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.15]"
        style={{
          backgroundImage: "radial-gradient(circle, #2A2A1A 1px, transparent 1px)",
          backgroundSize:  "32px 32px",
        }}
      />

      {/* ── Left panel (desktop) ──────────────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-center px-16 w-[44%] shrink-0">
        <div className="max-w-[400px]">
          {/* Brand */}
          <div className="flex items-center gap-2.5 mb-12">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
            >
              <Building2 size={15} style={{ color: A }} />
            </div>
            <span className="text-white font-semibold text-[15px]">Platstock Advisor</span>
          </div>

          <h1 className="text-[42px] font-semibold text-white leading-[1.1] tracking-tight mb-4">
            Behavioral intelligence<br />for your clients.
          </h1>
          <p className="text-[#9CA3AF] text-[15px] leading-relaxed mb-10">
            Upload a client&apos;s trading history. Receive a data-backed audit
            your prospect can&apos;t argue with.
          </p>

          <div className="space-y-5">
            {[
              ["Behavioral Tax",    "Quantify the cost of emotional trading decisions"],
              ["Panic Sell Rate",   "Identify liquidation patterns at key drawdown events"],
              ["A–F Report Card",   "Print-ready PDF built for advisor-client conversations"],
              ["Timing Quality",    "Score entry/exit points against volatility benchmarks"],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-start gap-3">
                <div
                  className="w-5 h-5 rounded-full mt-0.5 flex items-center justify-center shrink-0"
                  style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
                >
                  <Check size={10} style={{ color: A }} />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{title}</p>
                  <p className="text-[#6B7280] text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[#374151] text-xs mt-12">
            Free tier · 5 reports/month · No credit card required
          </p>
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────────── */}
      <div className="relative flex-1 flex items-start justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-[420px]">

          {/* Mobile brand */}
          <div className="flex items-center gap-2 justify-center mb-8 lg:hidden">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
            >
              <Building2 size={13} style={{ color: A }} />
            </div>
            <span className="text-white font-semibold text-sm">Platstock Advisor</span>
          </div>

          <div
            className="rounded-2xl p-8"
            style={{
              background:  CARD_BG,
              border:      `1px solid ${CARD_BD}`,
              boxShadow:   "0 0 0 1px rgba(201,168,76,0.04), 0 24px 48px rgba(0,0,0,0.4)",
            }}
          >
            <div className="mb-6">
              <h2 className="text-[20px] font-semibold text-white leading-tight">
                Create advisor account
              </h2>
              <p className="text-[#6B7280] text-sm mt-1.5">
                For registered investment advisors &amp; RIA firms
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* Firm name */}
              <div>
                <label
                  htmlFor={`${uid}-firm`}
                  className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide"
                >
                  Firm name
                </label>
                <input
                  id={`${uid}-firm`}
                  type="text"
                  required
                  minLength={2}
                  maxLength={200}
                  value={firmName}
                  onChange={e => setFirmName(e.target.value)}
                  placeholder="Acme Wealth Management"
                  autoComplete="organization"
                  className={INPUT_CLS}
                  style={{ border: `1px solid ${CARD_BD}` }}
                  {...border}
                />
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor={`${uid}-email`}
                  className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide"
                >
                  Work email
                </label>
                <input
                  id={`${uid}-email`}
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@yourfirm.com"
                  autoComplete="email"
                  className={INPUT_CLS}
                  style={{ border: `1px solid ${CARD_BD}` }}
                  {...border}
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor={`${uid}-pw`}
                  className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id={`${uid}-pw`}
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    className={`${INPUT_CLS} pr-10`}
                    style={{ border: `1px solid ${CARD_BD}` }}
                    {...border}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Strength bar + checklist */}
                {password.length > 0 && (
                  <div className="mt-2.5 space-y-2">
                    {/* 5-segment bar */}
                    <div className="flex gap-1" role="progressbar" aria-valuenow={strength} aria-valuemax={5}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div
                          key={i}
                          className="h-1 flex-1 rounded-full transition-all duration-300"
                          style={{
                            background: i <= strength
                              ? STRENGTH_COLOR[strength]
                              : "rgba(255,255,255,0.06)",
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="text-xs font-medium"
                      style={{ color: STRENGTH_COLOR[strength] || "#4B5563" }}
                    >
                      {STRENGTH_LABEL[strength]}
                    </p>

                    {/* Requirement checklist */}
                    <div className="space-y-1.5 pt-0.5">
                      {PW_REQUIREMENTS.map((req, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div
                            className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all"
                            style={{
                              background: pwMet[i] ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
                              border:     `1px solid ${pwMet[i] ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.07)"}`,
                            }}
                          >
                            {pwMet[i]
                              ? <Check size={8} className="text-emerald-400" />
                              : <X     size={8} className="text-[#374151]" />
                            }
                          </div>
                          <span
                            className="text-xs transition-colors"
                            style={{ color: pwMet[i] ? "#10B981" : "#6B7280" }}
                          >
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
                <label
                  htmlFor={`${uid}-con`}
                  className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide"
                >
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id={`${uid}-con`}
                    type={showCon ? "text" : "password"}
                    required
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    className={`${INPUT_CLS} pr-10`}
                    style={{
                      border: `1px solid ${
                        pwNoMatch ? "rgba(239,68,68,0.4)" :
                        pwMatch   ? "rgba(16,185,129,0.3)" :
                        CARD_BD
                      }`,
                    }}
                    {...border}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCon(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors"
                    aria-label={showCon ? "Hide password" : "Show password"}
                  >
                    {showCon ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {confirm.length > 0 && (
                  <p
                    className="text-xs mt-1.5 flex items-center gap-1"
                    style={{ color: pwMatch ? "#10B981" : "#EF4444" }}
                  >
                    {pwMatch ? <Check size={10} /> : <X size={10} />}
                    {pwMatch ? "Passwords match" : "Passwords do not match"}
                  </p>
                )}
              </div>

              {/* Terms */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={agreed}
                  onClick={() => setAgreed(v => !v)}
                  className="w-4 h-4 mt-0.5 rounded shrink-0 flex items-center justify-center transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    background: agreed ? A_BG    : "transparent",
                    border:     `1px solid ${agreed ? A : "#2E2E3E"}`,
                    outlineColor: A,
                  }}
                >
                  {agreed && <Check size={9} style={{ color: A }} />}
                </button>
                <span className="text-xs text-[#6B7280] leading-relaxed">
                  I agree to the{" "}
                  <span className="font-medium hover:underline cursor-pointer" style={{ color: A }}>
                    Terms of Service
                  </span>{" "}
                  and{" "}
                  <span className="font-medium hover:underline cursor-pointer" style={{ color: A }}>
                    Privacy Policy
                  </span>
                  . I confirm I am an authorised representative of the firm above.
                </span>
              </label>

              {/* Error */}
              {error && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-red-400 text-sm"
                  role="alert"
                  style={{
                    background: "rgba(239,68,68,0.07)",
                    border:     "1px solid rgba(239,68,68,0.18)",
                  }}
                >
                  <X size={14} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !allPwMet || !pwMatch || !agreed || !firmName.trim() || !email}
                className="w-full flex items-center justify-center gap-2 text-[#0A0A0F] text-sm font-semibold rounded-lg py-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background:  GOLD,
                  boxShadow:   loading ? "none" : `0 0 24px rgba(201,168,76,0.22)`,
                }}
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? "Creating account…" : "Create advisor account"}
              </button>
            </form>

            <p className="text-center mt-5 text-sm text-[#6B7280]">
              Already have an account?{" "}
              <Link
                href="/advisor/login"
                className="font-medium hover:underline"
                style={{ color: A }}
              >
                Sign in →
              </Link>
            </p>
          </div>

          <p className="text-center mt-4 text-xs text-[#374151]">
            Not an advisor?{" "}
            <Link
              href="/"
              className="hover:text-[#6B7280] underline transition-colors"
            >
              Go to Platstock retail login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// Expose the accent colour for consistent use in shared elements.
const GOLD = A;
void GOLD;
