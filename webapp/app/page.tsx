"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [mode,     setMode]     = useState<"signin" | "signup">("signin");
  const [sent,     setSent]     = useState(false); // post-signup verify-email state

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error: authErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // After email verification, Supabase redirects to /auth/callback
            // which advances the state machine and sets the routing cookie.
            emailRedirectTo: `${location.origin}/auth/callback`,
          },
        });
        if (authErr) throw authErr;

        if (data.session) {
          // Email confirmation disabled in Supabase project → immediate session.
          // /api/onboarding GET will sync the cookie; redirect to onboarding.
          await fetch("/api/onboarding"); // sync cookie
          router.push("/onboarding/mfa");
        } else {
          // Confirmation email sent → show "check your inbox" view.
          setSent(true);
        }
      } else {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authErr) throw authErr;

        // Existing users have no onboarding cookie → middleware allows dashboard.
        // New users who somehow land here mid-onboarding will be redirected by
        // middleware to their current step via the cookie set in auth/callback.
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Post-signup: "check your email" screen ────────────────────────────────
  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/15 border border-accent/20 mx-auto">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-accent" stroke="currentColor" strokeWidth={2}>
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Check your inbox</h2>
            <p className="text-slate-400 text-sm mt-2">
              We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
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

  // ── Sign in / Sign up form ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent mb-4">
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth={2}>
              <path d="M3 3v18h18" /><path d="m7 16 4-4 4 4 5-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">Platstock</h1>
          <p className="text-muted text-sm mt-1">Institutional Portfolio Analytics</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-medium mb-5 text-white">
            {mode === "signin" ? "Sign in to your account" : "Create your account"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-accent/60 transition-colors"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm text-muted mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-muted focus:outline-none focus:border-accent/60 transition-colors"
                  placeholder="••••••••"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {mode === "signup" && (
                <p className="text-xs text-muted mt-1.5">At least 8 characters</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading
                ? "Loading…"
                : mode === "signin"
                ? "Sign in"
                : "Create account"}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-5">
            {mode === "signin" ? "No account? " : "Already have one? "}
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
              className="text-accent hover:underline"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
