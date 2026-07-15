"use client";

/**
 * /advisor/verify
 *
 * Shown by middleware when an advisor is authenticated but their email is not
 * yet confirmed (email_confirmed_at is null). This is the only state where
 * an advisor session exists but protected routes are still blocked.
 */

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Building2, Mail, RefreshCw, LogOut } from "lucide-react";

const A        = "#C9A84C";
const A_BG     = "rgba(201,168,76,0.08)";
const A_BORDER = "rgba(201,168,76,0.18)";

export default function AdvisorVerifyEmail() {
  const supabase  = createClient();
  const [resent,    setResent]    = useState(false);
  const [resending, setResending] = useState(false);

  async function resendVerification() {
    setResending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        await supabase.auth.resend({ type: "signup", email: user.email });
      }
      setResent(true);
    } finally {
      setResending(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/advisor/login";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 600px 300px at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div
          className="rounded-2xl p-10 text-center space-y-6"
          style={{
            background: "#111118",
            border:     `1px solid #1E1E2E`,
            boxShadow:  "0 0 0 1px rgba(201,168,76,0.04), 0 24px 48px rgba(0,0,0,0.4)",
          }}
        >
          {/* Brand */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
            >
              <Building2 size={13} style={{ color: A }} />
            </div>
            <span className="text-white font-semibold text-sm">Platstock Advisor</span>
          </div>

          {/* Mail icon */}
          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
            style={{ background: A_BG, border: `1px solid ${A_BORDER}` }}
          >
            <Mail size={28} style={{ color: A }} />
          </div>

          {/* Copy */}
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-white">Verify your email</h1>
            <p className="text-[#6B7280] text-sm leading-relaxed">
              Your advisor account is created. We need to verify your email
              before you can access the portal. Check your inbox for the
              confirmation link.
            </p>
          </div>

          {/* Steps */}
          <div className="text-left space-y-2.5">
            {[
              "Open the email from Platstock Advisor",
              "Click the \"Confirm your email\" link",
              "You'll be redirected to your advisor dashboard",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                  style={{ background: A_BG, border: `1px solid ${A_BORDER}`, color: A }}
                >
                  {i + 1}
                </div>
                <p className="text-sm text-[#9CA3AF]">{step}</p>
              </div>
            ))}
          </div>

          {/* Resend */}
          {resent ? (
            <div
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm"
              style={{
                background: "rgba(16,185,129,0.07)",
                border:     "1px solid rgba(16,185,129,0.18)",
                color:      "#10B981",
              }}
            >
              Email resent — check your inbox
            </div>
          ) : (
            <button
              onClick={resendVerification}
              disabled={resending}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all disabled:opacity-50"
              style={{
                background: A_BG,
                border:     `1px solid ${A_BORDER}`,
                color:      A,
              }}
            >
              {resending
                ? <><RefreshCw size={13} className="animate-spin" /> Resending…</>
                : <><RefreshCw size={13} /> Resend verification email</>
              }
            </button>
          )}

          {/* Footer links */}
          <div className="flex items-center justify-between pt-2 text-xs text-[#4B5563]">
            <Link
              href="/advisor/login"
              className="hover:text-[#9CA3AF] underline transition-colors"
            >
              Back to sign in
            </Link>
            <button
              onClick={signOut}
              className="flex items-center gap-1 hover:text-[#9CA3AF] transition-colors"
            >
              <LogOut size={11} />
              Sign out
            </button>
          </div>
        </div>

        <p className="text-center mt-4 text-xs text-[#374151]">
          Link expired?{" "}
          <span className="text-[#6B7280]">
            Use the resend button above to get a fresh one.
          </span>
        </p>
      </div>
    </div>
  );
}
