"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, Loader2 } from "lucide-react";

const CURRENCIES = [
  { code: "USD", label: "US Dollar"         },
  { code: "EUR", label: "Euro"              },
  { code: "GBP", label: "British Pound"     },
  { code: "INR", label: "Indian Rupee"      },
  { code: "JPY", label: "Japanese Yen"      },
  { code: "CAD", label: "Canadian Dollar"   },
  { code: "AUD", label: "Australian Dollar" },
  { code: "SGD", label: "Singapore Dollar"  },
];

export default function WorkspacePage() {
  const router = useRouter();

  const [name,     setName]     = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Workspace name is required"); return; }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/onboarding", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "workspace", name: name.trim(), currency }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      router.push("/onboarding/connect");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#161b22] border border-white/8 rounded-2xl p-8 space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 mx-auto mb-4">
          <Building2 size={24} className="text-accent" />
        </div>
        <h2 className="text-xl font-semibold text-white">Set up your workspace</h2>
        <p className="text-slate-400 text-sm mt-2">
          Give your portfolio workspace a name and pick your reporting currency.
          You can change these later.
        </p>
      </div>

      <form onSubmit={save} className="space-y-5">
        {/* Workspace name */}
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">
            Workspace name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rishab's Portfolio"
            maxLength={80}
            className="w-full bg-white/4 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent/40 transition-colors"
            autoFocus
          />
        </div>

        {/* Reporting currency */}
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">
            Reporting currency
          </label>
          <div className="grid grid-cols-4 gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCurrency(c.code)}
                className={`py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                  currency === c.code
                    ? "bg-accent/15 border-accent/40 text-accent"
                    : "bg-white/4 border-white/8 text-slate-400 hover:text-white hover:border-white/20"
                }`}
              >
                {c.code}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {CURRENCIES.find((c) => c.code === currency)?.label}
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {loading && <Loader2 size={15} className="animate-spin" />}
          {loading ? "Saving…" : "Save & continue →"}
        </button>
      </form>
    </div>
  );
}
