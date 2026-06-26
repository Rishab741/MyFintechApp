"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, CheckCircle2, Loader2, Shield, ShieldOff } from "lucide-react";

type UIState = "loading" | "enroll" | "verify" | "success" | "unavailable" | "error";

async function advance(mfaEnrolled: boolean) {
  const res = await fetch("/api/onboarding", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ action: "advance", mfa_enrolled: mfaEnrolled }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to advance");
}

export default function MfaPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [state,       setState]       = useState<UIState>("loading");
  const [factorId,    setFactorId]    = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [qrCode,      setQrCode]      = useState("");
  const [secret,      setSecret]      = useState("");
  const [code,        setCode]        = useState("");
  const [error,       setError]       = useState("");

  // ── Enroll on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase.auth.mfa.enroll({
        factorType:   "totp",
        friendlyName: "Platstock Authenticator",
      });
      if (e || !data) {
        setState("unavailable");
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setState("enroll");
    })();
  }, []);

  // ── Create challenge (move from QR screen → code entry screen) ──────────
  async function startVerify() {
    setError("");
    const { data, error: e } = await supabase.auth.mfa.challenge({ factorId });
    if (e || !data) { setError(e?.message ?? "Challenge failed"); return; }
    setChallengeId(data.id);
    setState("verify");
  }

  // ── Verify TOTP code ────────────────────────────────────────────────────
  async function verify() {
    setError("");
    const { error: e } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.replace(/\s/g, ""),
    });
    if (e) { setError(e.message); return; }
    setState("success");
    await advance(true);
    router.push("/onboarding/workspace");
  }

  // ── Skip MFA ─────────────────────────────────────────────────────────────
  async function skip() {
    await advance(false);
    router.push("/onboarding/workspace");
  }

  // ── Unavailable ──────────────────────────────────────────────────────────
  if (state === "unavailable") {
    return (
      <div className="bg-[#161b22] border border-white/8 rounded-2xl p-8 text-center space-y-5">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 mx-auto">
          <ShieldOff size={24} className="text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">MFA not configured</h2>
          <p className="text-slate-400 text-sm mt-2">
            TOTP multi-factor authentication is not enabled in this Supabase project.
            You can enable it under <span className="text-white font-mono">Authentication → MFA</span> in your Supabase dashboard.
          </p>
        </div>
        <button
          onClick={skip}
          className="w-full py-3 bg-white/6 hover:bg-white/10 border border-white/10 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Continue without MFA
        </button>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className="bg-[#161b22] border border-white/8 rounded-2xl p-8 flex items-center justify-center">
        <Loader2 size={28} className="text-accent animate-spin" />
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (state === "success") {
    return (
      <div className="bg-[#161b22] border border-white/8 rounded-2xl p-8 text-center space-y-4">
        <CheckCircle2 size={40} className="text-green-400 mx-auto" />
        <h2 className="text-xl font-semibold text-white">MFA enabled</h2>
        <p className="text-slate-400 text-sm">Redirecting…</p>
      </div>
    );
  }

  // ── Enroll: QR code ──────────────────────────────────────────────────────
  if (state === "enroll") {
    return (
      <div className="bg-[#161b22] border border-white/8 rounded-2xl p-8 space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 mx-auto mb-4">
            <Shield size={24} className="text-accent" />
          </div>
          <h2 className="text-xl font-semibold text-white">Secure your account</h2>
          <p className="text-slate-400 text-sm mt-2">
            Scan the QR code with your authenticator app (Google Authenticator, 1Password, Authy, etc.)
          </p>
        </div>

        {/* QR code */}
        <div className="flex justify-center">
          <div className="bg-white p-3 rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="TOTP QR code" className="w-40 h-40" />
          </div>
        </div>

        {/* Manual entry */}
        <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-widest">Manual entry</p>
          <p className="text-xs font-mono text-slate-300 break-all">{secret}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={skip}
            className="py-3 border border-white/10 text-slate-400 hover:text-white text-sm font-medium rounded-xl transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={startVerify}
            className="py-3 bg-accent hover:bg-accent/80 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            I've scanned it →
          </button>
        </div>
      </div>
    );
  }

  // ── Verify: 6-digit code ─────────────────────────────────────────────────
  return (
    <div className="bg-[#161b22] border border-white/8 rounded-2xl p-8 space-y-6">
      <div className="text-center">
        <Shield size={28} className="text-accent mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-white">Enter the code</h2>
        <p className="text-slate-400 text-sm mt-2">
          Open your authenticator app and enter the 6-digit code shown for Platstock.
        </p>
      </div>

      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
        placeholder="000 000"
        className="w-full text-center text-2xl font-mono tracking-[0.3em] bg-white/4 border border-white/8 rounded-xl px-4 py-4 text-white placeholder-slate-700 focus:outline-none focus:border-accent/40 transition-colors"
        autoFocus
      />

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { setState("enroll"); setCode(""); setError(""); }}
          className="py-3 border border-white/10 text-slate-400 hover:text-white text-sm font-medium rounded-xl transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={verify}
          disabled={code.length !== 6}
          className="py-3 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Verify
        </button>
      </div>
    </div>
  );
}
