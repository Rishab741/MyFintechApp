"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { createClient } from "@/lib/supabase/client";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import { Key, Copy, Trash2, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";



export default function ApiKeysPage() {
  const { data: tenant, isLoading } = useSWR("tenant", async () => {
    const jwt = await getJwt();
    return engine.tenant.me(jwt);
  });

  const [newKey,   setNewKey]   = useState<string | null>(null);
  const [label,    setLabel]    = useState("");
  const [copied,   setCopied]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [confirm,  setConfirm]  = useState<"issue" | "revoke" | null>(null);

  async function issueKey() {
    setLoading(true); setError(""); setNewKey(null);
    try {
      const jwt = await getJwt();
      const res = await engine.tenant.issueApiKey(jwt, label || undefined);
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
      const jwt = await getJwt();
      await engine.tenant.revokeApiKey(jwt);
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">API Keys</h1>
        <p className="text-sm text-muted mt-1">
          Use your API key to authenticate B2B integrations with the Platstock engine.
        </p>
      </div>

      {/* Current key status */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-muted" />
            <h2 className="font-medium text-white">Current API Key</h2>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full border ${
            tenant?.has_api_key
              ? "text-positive bg-positive/10 border-positive/20"
              : "text-muted bg-white/5 border-border"
          }`}>
            {isLoading ? "…" : tenant?.has_api_key ? "Active" : "None"}
          </span>
        </div>

        {tenant?.has_api_key ? (
          <div className="space-y-3">
            <div className="bg-surface rounded-lg px-4 py-3 font-mono text-sm text-muted">
              vst_live_••••••••••••••••••••••••••••••••••••••••••••••••••
            </div>
            {tenant.api_key_label && (
              <p className="text-sm text-muted">Label: <span className="text-white">{tenant.api_key_label}</span></p>
            )}
            {tenant.api_key_issued_at && (
              <p className="text-sm text-muted">
                Issued: <span className="text-white">{new Date(tenant.api_key_issued_at).toLocaleString()}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">No API key issued. Generate one below to enable B2B integrations.</p>
        )}

        {error && (
          <p className="mt-3 text-sm text-negative">{error}</p>
        )}
      </div>

      {/* New key reveal */}
      {newKey && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-warning" />
            <p className="text-sm font-medium text-warning">
              Copy this key now — it will not be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-surface rounded-lg px-3 py-2.5 text-xs font-mono text-white break-all">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="shrink-0 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              {copied ? <CheckCircle size={16} className="text-positive" /> : <Copy size={16} className="text-muted" />}
            </button>
          </div>
        </div>
      )}

      {/* Issue / Rotate */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-medium text-white">
          {tenant?.has_api_key ? "Rotate API Key" : "Generate API Key"}
        </h2>
        <div>
          <label className="block text-sm text-muted mb-1">Label (optional)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Production, CI/CD"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent"
          />
        </div>

        {confirm === "issue" ? (
          <div className="flex gap-2">
            <p className="text-sm text-muted flex-1">
              {tenant?.has_api_key ? "This will invalidate your current key immediately." : "Generate a new API key?"}
            </p>
            <button onClick={() => setConfirm(null)} className="text-sm text-muted hover:text-white px-3 py-1.5 rounded-lg border border-border">Cancel</button>
            <button onClick={issueKey} disabled={loading} className="text-sm bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
              {loading ? "…" : "Confirm"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirm("issue")}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw size={15} />
            {tenant?.has_api_key ? "Rotate Key" : "Generate Key"}
          </button>
        )}
      </div>

      {/* Revoke */}
      {tenant?.has_api_key && (
        <div className="bg-card border border-negative/20 rounded-xl p-5">
          <h2 className="font-medium text-white mb-1">Revoke Key</h2>
          <p className="text-sm text-muted mb-4">Immediately invalidates the current key. All requests using it will be rejected.</p>

          {confirm === "revoke" ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirm(null)} className="text-sm text-muted hover:text-white px-3 py-1.5 rounded-lg border border-border">Cancel</button>
              <button onClick={revokeKey} disabled={loading} className="text-sm bg-negative hover:bg-red-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                {loading ? "…" : "Revoke"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirm("revoke")}
              className="flex items-center gap-2 text-negative border border-negative/30 hover:bg-negative/10 px-4 py-2 rounded-lg text-sm transition-colors"
            >
              <Trash2 size={15} />
              Revoke API Key
            </button>
          )}
        </div>
      )}
    </div>
  );
}
