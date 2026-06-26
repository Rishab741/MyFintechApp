"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Mail, RefreshCw } from "lucide-react";

export default function VerifyEmailPage() {
  const supabase = createClient();
  const [resent,   setResent]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function resend() {
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("No email on file");
      const { error: e } = await supabase.auth.resend({
        type:  "signup",
        email: user.email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (e) throw e;
      setResent(true);
      setTimeout(() => setResent(false), 60_000);
    } catch (err: any) {
      setError(err.message ?? "Failed to resend");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#161b22] border border-white/8 rounded-2xl p-8 text-center space-y-6">
      {/* Icon */}
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 mx-auto">
        <Mail size={28} className="text-accent" />
      </div>

      {/* Copy */}
      <div>
        <h2 className="text-xl font-semibold text-white">Verify your email</h2>
        <p className="text-slate-400 text-sm mt-2 leading-relaxed">
          We sent a confirmation link to your inbox. Click it to continue — your account
          is waiting on the other side.
        </p>
      </div>

      {/* Steps */}
      <div className="text-left space-y-3 bg-white/3 rounded-xl p-4 border border-white/6">
        {[
          "Open the email from Platstock",
          'Click "Confirm your account"',
          "You'll be taken to the next setup step automatically",
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-bold shrink-0 mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-slate-300">{step}</p>
          </div>
        ))}
      </div>

      {/* Resend */}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      <button
        onClick={resend}
        disabled={loading || resent}
        className="flex items-center gap-2 mx-auto text-sm text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
      >
        {loading
          ? <Loader2 size={14} className="animate-spin" />
          : <RefreshCw size={14} />}
        {resent ? "Email sent! Check your inbox." : "Resend confirmation email"}
      </button>
    </div>
  );
}
