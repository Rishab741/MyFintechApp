"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import { Key, Copy, Trash2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function ApiKeysPage() {
  const { data: tenant, isLoading } = useSWR("tenant", async () =>
    engine.tenant.me(await getJwt())
  );

  const [newKey,  setNewKey]  = useState<string | null>(null);
  const [label,   setLabel]   = useState("");
  const [copied,  setCopied]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [confirm, setConfirm] = useState<"issue" | "revoke" | null>(null);

  async function issueKey() {
    setLoading(true); setError(""); setNewKey(null);
    try {
      const res = await engine.tenant.issueApiKey(await getJwt(), label || undefined);
      setNewKey(res.api_key);
      await mutate("tenant");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to issue key");
    } finally {
      setLoading(false); setConfirm(null);
    }
  }

  async function revokeKey() {
    setLoading(true); setError("");
    try {
      await engine.tenant.revokeApiKey(await getJwt());
      setNewKey(null);
      await mutate("tenant");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setLoading(false); setConfirm(null);
    }
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const card = { background: "#111118", border: "1px solid #1A1A28" };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-white">API Keys</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Authenticate B2B integrations with the Platstock engine.
        </p>
      </div>

      {/* Current key status */}
      <div className="rounded-xl p-6" style={card}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/8">
              <Key size={15} className="text-accent" />
            </div>
            <h2 className="font-semibold text-white text-sm">Current API Key</h2>
          </div>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={
              tenant?.has_api_key
                ? { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid #1A1A28", color: "#6B7280" }
            }
          >
            {isLoading ? "…" : tenant?.has_api_key ? "Active" : "None"}
          </span>
        </div>

        {tenant?.has_api_key ? (
          <div className="space-y-3">
            <div
              className="rounded-lg px-4 py-3 font-mono text-sm text-[#6B7280]"
              style={{ background: "#0A0A0F", border: "1px solid #1A1A28" }}
            >
              pst_live_••••••••••••••••••••••••••••••••••••••••••••••••
            </div>
            {tenant.api_key_label && (
              <p className="text-sm text-[#6B7280]">
                Label: <span className="text-white">{tenant.api_key_label}</span>
              </p>
            )}
            {tenant.api_key_issued_at && (
              <p className="text-sm text-[#6B7280]">
                Issued:{" "}
                <span className="text-white">{new Date(tenant.api_key_issued_at).toLocaleString()}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-[#6B7280]">
            No API key issued. Generate one below to enable B2B integrations.
          </p>
        )}

        {error && <p className="mt-4 text-sm text-[#EF4444]">{error}</p>}
      </div>

      {/* One-time key reveal */}
      {newKey && (
        <div
          className="rounded-xl p-5"
          style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
            <p className="text-sm font-medium" style={{ color: "#F59E0B" }}>
              Copy this key now — it will not be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 rounded-lg px-3 py-2.5 text-xs font-mono text-white break-all"
              style={{ background: "#0A0A0F", border: "1px solid #1A1A28" }}
            >
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="shrink-0 p-2.5 rounded-lg transition-colors"
              style={{ background: "#1A1A28" }}
            >
              {copied
                ? <CheckCircle2 size={16} style={{ color: "#10B981" }} />
                : <Copy size={16} className="text-[#6B7280]" />}
            </button>
          </div>
        </div>
      )}

      {/* Issue / Rotate */}
      <div className="rounded-xl p-6 space-y-4" style={card}>
        <h2 className="font-semibold text-white text-sm">
          {tenant?.has_api_key ? "Rotate API Key" : "Generate API Key"}
        </h2>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#4B5563] mb-1.5">
            Label (optional)
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Production, CI/CD"
            className="w-full rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-[#4B5563] focus:outline-none transition-all"
            style={{ background: "#0A0A0F", border: "1px solid #1A1A28" }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(139,92,246,0.4)")}
            onBlur={(e)  => (e.target.style.borderColor = "#1A1A28")}
          />
        </div>

        {confirm === "issue" ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-[#6B7280] flex-1">
              {tenant?.has_api_key
                ? "This will invalidate your current key immediately."
                : "Generate a new API key?"}
            </p>
            <button
              onClick={() => setConfirm(null)}
              className="text-sm text-[#6B7280] hover:text-white px-3 py-1.5 rounded-lg transition-colors"
              style={{ border: "1px solid #1A1A28" }}
            >
              Cancel
            </button>
            <button
              onClick={issueKey}
              disabled={loading}
              className="text-sm text-white px-4 py-1.5 rounded-lg disabled:opacity-50 transition-all"
              style={{ background: "#8B5CF6" }}
            >
              {loading ? "…" : "Confirm"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirm("issue")}
            className="flex items-center gap-2 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: "#8B5CF6", boxShadow: "0 0 18px rgba(139,92,246,0.2)" }}
          >
            <RefreshCw size={14} />
            {tenant?.has_api_key ? "Rotate Key" : "Generate Key"}
          </button>
        )}
      </div>

      {/* Revoke */}
      {tenant?.has_api_key && (
        <div
          className="rounded-xl p-5"
          style={{ background: "#111118", border: "1px solid rgba(239,68,68,0.15)" }}
        >
          <h2 className="font-semibold text-white text-sm mb-1">Revoke Key</h2>
          <p className="text-sm text-[#6B7280] mb-4">
            Immediately invalidates the current key. All requests using it will be rejected.
          </p>

          {confirm === "revoke" ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="text-sm text-[#6B7280] hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                style={{ border: "1px solid #1A1A28" }}
              >
                Cancel
              </button>
              <button
                onClick={revokeKey}
                disabled={loading}
                className="text-sm text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
                style={{ background: "#EF4444" }}
              >
                {loading ? "…" : "Revoke"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirm("revoke")}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors"
              style={{
                color: "#EF4444",
                border: "1px solid rgba(239,68,68,0.25)",
                background: "transparent",
              }}
            >
              <Trash2 size={14} />
              Revoke API Key
            </button>
          )}
        </div>
      )}
    </div>
  );
}
