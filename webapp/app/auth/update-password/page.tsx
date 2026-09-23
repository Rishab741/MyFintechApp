"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";

export default function UpdatePasswordPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setDone(true);
      // Let middleware route to the right home surface (dashboard / advisor
      // dashboard / admin / onboarding step) based on the session it already has.
      setTimeout(() => { router.push("/"); router.refresh(); }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 700px 400px at 50% 0%, rgba(201,162,75,0.10) 0%, transparent 70%)",
        }}
      />
      <div className="relative w-full max-w-sm">
        <div
          className="rounded-2xl p-8"
          style={{
            background: "#111118",
            border: "1px solid #1E1E2E",
            boxShadow: "0 0 0 1px rgba(201,162,75,0.04), 0 24px 48px rgba(0,0,0,0.4)",
          }}
        >
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle2 size={32} className="mx-auto text-accent" />
              <p className="text-white font-medium text-sm">Password updated</p>
              <p className="text-[#6B7280] text-xs leading-relaxed">
                Taking you to your dashboard…
              </p>
            </div>
          ) : (
            <>
              <div className="mb-7">
                <h2 className="text-[22px] font-semibold text-white leading-tight">
                  Set a new password
                </h2>
                <p className="text-[#6B7280] text-sm mt-1.5">
                  Choose a new password for your account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full text-sm text-white placeholder-[#4B5563] rounded-lg px-3.5 py-3 pr-10 focus:outline-none transition-all"
                      style={{ background: "#0A0A0F", border: "1px solid #1E1E2E" }}
                      onFocus={(e) => (e.target.style.borderColor = "rgba(201,162,75,0.5)")}
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
                  <p className="text-xs text-[#4B5563] mt-1.5">At least 8 characters</p>
                </div>

                <div>
                  <label className="block text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase tracking-wide">
                    Confirm password
                  </label>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full text-sm text-white placeholder-[#4B5563] rounded-lg px-3.5 py-3 focus:outline-none transition-all"
                    style={{ background: "#0A0A0F", border: "1px solid #1E1E2E" }}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(201,162,75,0.5)")}
                    onBlur={(e) => (e.target.style.borderColor = "#1E1E2E")}
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 text-white text-sm font-medium rounded-lg py-3 transition-all disabled:opacity-50"
                  style={{
                    background: loading ? "rgba(201,162,75,0.7)" : "#C9A24B",
                    boxShadow: loading ? "none" : "0 0 20px rgba(201,162,75,0.25)",
                  }}
                >
                  {loading && <Loader2 size={15} className="animate-spin" />}
                  {loading ? "Updating…" : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
