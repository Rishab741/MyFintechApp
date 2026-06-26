"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2, Shield, BarChart2, Zap, Mail } from "lucide-react";

const FEATURES = [
  {
    icon: Shield,
    title: "Tamper-evident ledger",
    sub: "Every transaction hash-chained with SHA-256",
  },
  {
    icon: BarChart2,
    title: "Monte Carlo simulation",
    sub: "1,000 paths. Probabilistic outcomes.",
  },
  {
    icon: Zap,
    title: "Zero-latency insights",
    sub: "Sub-200ms API. Real-time market alpha.",
  },
];

function PlatstockLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-accent shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="text-white"
        stroke="currentColor"
        strokeWidth={2.5}
        style={{ width: size * 0.5, height: size * 0.5 }}
      >
        <path d="M3 3v18h18" />
        <path d="m7 16 4-4 4 4 5-5" />
      </svg>
    </div>
  );
}

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [mode,     setMode]     = useState<"signin" | "signup">("signin");
  const [sent,     setSent]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: authErr } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        });
        if (authErr) throw authErr;
        if (data.session) {
          await fetch("/api/onboarding");
          router.push("/onboarding/mfa");
        } else {
          setSent(true);
        }
      } else {
        const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
        if (authErr) throw authErr;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 700px 400px at 50% 0%, rgba(139,92,246,0.13) 0%, transparent 70%)",
          }}
        />
        <div className="relative w-full max-w-sm text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 mx-auto">
            <Mail size={28} className="text-accent" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Check your inbox</h2>
            <p className="text-[#6B7280] text-sm mt-2 leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="text-white font-medium">{email}</span>.
              Click it to continue setting up your account.
            </p>
          </div>
          <button
            onClick={() => { setSent(false); setMode("signin"); }}
            className="text-accent text-sm hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#0A0A0F] overflow-hidden">
      {/* ── Background glow ──────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 800px 500px at 30% 20%, rgba(139,92,246,0.10) 0%, transparent 70%)",
        }}
      />
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle, #2A2A3A 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* ── Left panel (desktop only) ─────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-center px-16 w-[55%] shrink-0">
        <div className="max-w-lg">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-12">
            <PlatstockLogo size={36} />
            <span className="text-white font-semibold text-lg">Platstock</span>
          </div>

          <h1 className="text-[52px] font-semibold text-white leading-[1.1] tracking-tight mb-5">
            Institutional-grade<br />portfolio intelligence.
          </h1>
          <p className="text-[#9CA3AF] text-lg leading-relaxed mb-12">
            SHA-256 ledger integrity. ML-driven risk models.<br />
            Real-time market alpha, on demand.
          </p>

          {/* Feature callouts */}
          <div className="space-y-5">
            {FEATURES.map(({ icon: Icon, title, sub }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 shrink-0 mt-0.5">
                  <Icon size={16} className="text-accent" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{title}</p>
                  <p className="text-[#6B7280] text-sm mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[#4B5563] text-xs mt-14">
            Trusted by portfolio managers worldwide
          </p>
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────── */}
      <div className="relative flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          {/* Mobile brand */}
          <div className="flex items-center gap-3 justify-center mb-8 lg:hidden">
            <PlatstockLogo size={32} />
            <span className="text-white font-semibold">Platstock</span>
          </div>

          <div
            className="rounded-2xl p-8"
            style={{
              background: "#111118",
              border: "1px solid #1E1E2E",
              boxShadow: "0 0 0 1px rgba(139,92,246,0.04), 0 24px 48px rgba(0,0,0,0.4)",
            }}
          >
            {/* Card header */}
            <div className="mb-7">
              <h2 className="text-[22px] font-semibold text-white leading-tight">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="text-[#6B7280] text-sm mt-1.5">
                {mode === "signin"
                  ? "Sign in to your portfolio dashboard"
                  : "Start tracking your portfolio today"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full text-sm text-white placeholder-[#4B5563] rounded-lg px-3.5 py-3 focus:outline-none transition-all"
                  style={{
                    background: "#0A0A0F",
                    border: "1px solid #1E1E2E",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(139,92,246,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "#1E1E2E")}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="w-full text-sm text-white placeholder-[#4B5563] rounded-lg px-3.5 py-3 pr-10 focus:outline-none transition-all"
                    style={{
                      background: "#0A0A0F",
                      border: "1px solid #1E1E2E",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(139,92,246,0.5)")}
                    onBlur={(e) => (e.target.style.borderColor = "#1E1E2E")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors"
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {mode === "signup" && (
                  <p className="text-xs text-[#4B5563] mt-1.5">At least 8 characters</p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* CTA */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 text-white text-sm font-medium rounded-lg py-3 transition-all disabled:opacity-50"
                style={{
                  background: loading ? "rgba(139,92,246,0.7)" : "#8B5CF6",
                  boxShadow: loading ? "none" : "0 0 20px rgba(139,92,246,0.25)",
                }}
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? "Loading…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-[#1E1E2E]" />
              <span className="text-[#4B5563] text-xs">or</span>
              <div className="flex-1 h-px bg-[#1E1E2E]" />
            </div>

            {/* Toggle mode */}
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
              className="w-full text-sm text-[#9CA3AF] hover:text-white rounded-lg py-2.5 border transition-colors"
              style={{ borderColor: "#1E1E2E" }}
            >
              {mode === "signin" ? "Create a new account" : "Sign in instead"}
            </button>

            {mode === "signin" && (
              <p className="text-center mt-4">
                <button className="text-accent text-xs hover:underline">
                  Forgot password?
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
