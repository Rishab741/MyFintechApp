"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Building2, Eye, EyeOff, Loader2, Mail, X, CheckCircle2,
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

// ── ForgotPassword sub-view ───────────────────────────────────────────────────
function ForgotPassword({ onBack }: { onBack: () => void }) {
  const supabase = createClient();
  const uid      = useId();
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/advisor-callback`,
      });
      if (err) throw err;
      setSent(true);
    } catch (err: unknown) {
      // Never reveal whether the email exists — always show the same message.
      void err;
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <CheckCircle2 size={32} className="mx-auto" style={{ color: A }} />
        <p className="text-white font-medium text-sm">Check your inbox</p>
        <p className="text-[#6B7280] text-xs leading-relaxed">
          If an advisor account exists for{" "}
          <span className="text-white">{email}</span>,
          you&apos;ll receive a reset link within a few minutes.
        </p>
        <button
          onClick={onBack}
          className="text-sm font-medium hover:underline"
          style={{ color: A }}
        >
          ← Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-white font-medium text-sm mb-1">Reset your password</p>
        <p className="text-[#6B7280] text-xs leading-relaxed">
          Enter your advisor account email. If it&apos;s registered, we&apos;ll send
          a reset link.
        </p>
      </div>
      <form onSubmit={handleReset} className="space-y-3">
        <div>
          <label
            htmlFor={`${uid}-reset-email`}
            className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide"
          >
            Email
          </label>
          <input
            id={`${uid}-reset-email`}
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@yourfirm.com"
            autoComplete="email"
            className={INPUT_CLS}
            style={{ border: `1px solid ${CARD_BD}` }}
            onFocus={e => (e.target.style.borderColor = A_BORDER)}
            onBlur={e  => (e.target.style.borderColor = CARD_BD)}
          />
        </div>
        {error && (
          <p className="text-red-400 text-xs">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !email}
          className="w-full flex items-center justify-center gap-2 text-[#0A0A0F] text-sm font-semibold rounded-lg py-2.5 transition-all disabled:opacity-40"
          style={{ background: A }}
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <button
        onClick={onBack}
        className="w-full text-sm text-[#6B7280] hover:text-[#9CA3AF] transition-colors py-1"
      >
        ← Back to sign in
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdvisorLogin() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();
  const uid          = useId();

  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [forgot,    setForgot]    = useState(false);

  // Surface errors passed via query param from the callback route.
  useEffect(() => {
    const qErr = searchParams.get("error");
    if (qErr) {
      const messages: Record<string, string> = {
        callback_failed:     "Email verification failed. Please try signing up again.",
        missing_firm_name:   "Firm name was missing. Please sign up again.",
        provision_failed:    "Account provisioning failed. Please contact support.",
        firm_creation_failed:"Firm setup failed. Please contact support.",
        email_link_invalid:  "That verification link has expired. Please sign in to request a new one.",
      };
      setError(messages[qErr] ?? decodeURIComponent(qErr));
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authErr) {
        // Normalise Supabase error messages for UX — don't expose internal details.
        const msg = authErr.message.toLowerCase();
        if (msg.includes("invalid login") || msg.includes("email not confirmed")) {
          throw new Error("Incorrect email or password. Please try again.");
        }
        throw authErr;
      }

      // ── Role check ─────────────────────────────────────────────────────────
      // app_metadata comes from the JWT — no extra network call needed.
      // If the user signed in but isn't an advisor, sign them out immediately
      // and show an informative error rather than silently redirecting.
      const role = data.user?.app_metadata?.role;
      if (role !== "advisor") {
        await supabase.auth.signOut();
        setError(
          role === undefined
            ? "Your email address has not been verified yet. Please check your inbox for the confirmation link."
            : "This account is not registered as an advisor account. Use the Platstock login instead."
        );
        return;
      }

      // ── Email verification check ────────────────────────────────────────────
      // Belt-and-suspenders: middleware also checks this, but a client check
      // gives an immediate, user-friendly message before any redirect.
      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        setError(
          "Please verify your email before signing in. Check your inbox for the confirmation link."
        );
        return;
      }

      // All checks passed — proceed.
      router.push("/advisor/dashboard");
      router.refresh();

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[#0A0A0F] overflow-hidden">

      {/* ── Background ────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 700px 400px at 60% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.13]"
        style={{
          backgroundImage: "radial-gradient(circle, #2A2A1A 1px, transparent 1px)",
          backgroundSize:  "32px 32px",
        }}
      />

      {/* ── Left panel (desktop) ──────────────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-center px-16 w-[45%] shrink-0">
        <div className="max-w-[380px]">
          <div className="flex items-center gap-2.5 mb-12">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
            >
              <Building2 size={15} style={{ color: A }} />
            </div>
            <span className="text-white font-semibold text-[15px]">Platstock Advisor</span>
          </div>

          <h1 className="text-[40px] font-semibold text-white leading-[1.1] tracking-tight mb-4">
            Welcome back,<br />advisor.
          </h1>
          <p className="text-[#9CA3AF] text-[15px] leading-relaxed">
            Sign in to access your firm&apos;s diagnostic workspace and client report history.
          </p>

          <div
            className="mt-10 rounded-xl p-5 space-y-3"
            style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: A }}
            >
              Security
            </p>
            {[
              "Role enforced via server-side JWT app_metadata",
              "Row-level security on all advisor data",
              "Audit log of every auth event",
            ].map(item => (
              <div key={item} className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: A }} />
                <p className="text-xs text-[#9CA3AF]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────────── */}
      <div className="relative flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">

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
              background: CARD_BG,
              border:     `1px solid ${CARD_BD}`,
              boxShadow:  "0 0 0 1px rgba(201,168,76,0.04), 0 24px 48px rgba(0,0,0,0.4)",
            }}
          >
            {forgot ? (
              <ForgotPassword onBack={() => { setForgot(false); setError(""); }} />
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-[20px] font-semibold text-white leading-tight">
                    Sign in to your firm
                  </h2>
                  <p className="text-[#6B7280] text-sm mt-1.5">
                    Advisor accounts only — separate from retail login
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>

                  {/* Email */}
                  <div>
                    <label
                      htmlFor={`${uid}-email`}
                      className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide"
                    >
                      Email
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
                      onFocus={e => (e.target.style.borderColor = A_BORDER)}
                      onBlur={e  => (e.target.style.borderColor = CARD_BD)}
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor={`${uid}-pw`}
                        className="block text-[#9CA3AF] text-xs font-medium uppercase tracking-wide"
                      >
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setForgot(true)}
                        className="text-xs hover:underline transition-colors"
                        style={{ color: A }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id={`${uid}-pw`}
                        type={showPw ? "text" : "password"}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className={`${INPUT_CLS} pr-10`}
                        style={{ border: `1px solid ${CARD_BD}` }}
                        onFocus={e => (e.target.style.borderColor = A_BORDER)}
                        onBlur={e  => (e.target.style.borderColor = CARD_BD)}
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
                  </div>

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
                    disabled={loading || !email || !password}
                    className="w-full flex items-center justify-center gap-2 text-[#0A0A0F] text-sm font-semibold rounded-lg py-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: A,
                      boxShadow:  loading ? "none" : "0 0 24px rgba(201,168,76,0.20)",
                    }}
                  >
                    {loading && <Loader2 size={15} className="animate-spin" />}
                    {loading ? "Signing in…" : "Sign in"}
                  </button>
                </form>

                {/* Email not verified helper */}
                <div
                  className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border:     "1px solid rgba(255,255,255,0.06)",
                    color:      "#6B7280",
                  }}
                >
                  <Mail size={12} className="shrink-0 mt-0.5" />
                  Didn&apos;t receive the verification email?{" "}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!email) { setError("Enter your email above first."); return; }
                      await supabase.auth.resend({ type: "signup", email });
                      setError("");
                      alert("Verification email resent — check your inbox.");
                    }}
                    className="underline underline-offset-2 hover:text-[#9CA3AF] ml-1"
                  >
                    Resend
                  </button>
                </div>

                <p className="text-center mt-5 text-sm text-[#6B7280]">
                  New firm?{" "}
                  <Link
                    href="/advisor/signup"
                    className="font-medium hover:underline"
                    style={{ color: A }}
                  >
                    Create an account →
                  </Link>
                </p>
              </>
            )}
          </div>

          <p className="text-center mt-4 text-xs text-[#374151]">
            Looking for the portfolio dashboard?{" "}
            <Link href="/" className="underline hover:text-[#6B7280] transition-colors">
              Platstock retail login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
