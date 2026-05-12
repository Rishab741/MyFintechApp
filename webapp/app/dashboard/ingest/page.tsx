"use client";

import { useState, useRef } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { engine, type IngestResult, type CustodianInfo } from "@/lib/engine";
import { Upload, CheckCircle, AlertCircle, FileText } from "lucide-react";

async function getJwt() {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? "";
}

export default function IngestPage() {
  const { data: custodians } = useSWR("custodians", async () => {
    const jwt = await getJwt();
    return engine.ingest.custodians(jwt);
  });

  const [custodian, setCustodian] = useState("schwab");
  const [dataType,  setDataType]  = useState("auto");
  const [file,      setFile]      = useState<File | null>(null);
  const [result,    setResult]    = useState<IngestResult | null>(null);
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(""); setResult(null); setLoading(true);

    try {
      const jwt = await getJwt();
      const res = await engine.ingest.upload(jwt, custodian, file, dataType);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Import Portfolio Data</h1>
        <p className="text-sm text-muted mt-1">
          Upload a CSV export from your custodian to sync holdings and transactions.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <form onSubmit={handleUpload} className="space-y-5">
          {/* Custodian */}
          <div>
            <label className="block text-sm text-muted mb-2">Custodian</label>
            <div className="grid grid-cols-3 gap-2">
              {(custodians ?? [{ slug: "schwab", label: "Schwab" }, { slug: "fidelity", label: "Fidelity" }, { slug: "csv_generic", label: "Generic CSV" }] as CustodianInfo[]).map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setCustodian(c.slug)}
                  className={`px-3 py-2.5 rounded-lg text-sm border transition-colors ${
                    custodian === c.slug
                      ? "bg-accent/15 border-accent text-accent"
                      : "border-border text-muted hover:text-white hover:border-white/20"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data type */}
          <div>
            <label className="block text-sm text-muted mb-2">Data type</label>
            <div className="flex gap-2">
              {["auto", "holdings", "transactions"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDataType(t)}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors capitalize ${
                    dataType === t
                      ? "bg-accent/15 border-accent text-accent"
                      : "border-border text-muted hover:text-white"
                  }`}
                >
                  {t === "auto" ? "Auto-detect" : t}
                </button>
              ))}
            </div>
          </div>

          {/* File drop */}
          <div>
            <label className="block text-sm text-muted mb-2">CSV file</label>
            <div
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                file
                  ? "border-accent/40 bg-accent/5"
                  : "border-border hover:border-white/20"
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText size={16} className="text-accent" />
                  <span className="text-white">{file.name}</span>
                  <span className="text-muted">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <>
                  <Upload size={24} className="mx-auto text-muted mb-2" />
                  <p className="text-sm text-muted">Drop CSV here or click to browse</p>
                  <p className="text-xs text-muted/60 mt-1">Max 10 MB</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-negative bg-negative/10 border border-negative/20 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!file || loading}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? "Importing…" : "Import"}
          </button>
        </form>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-card border border-positive/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={18} className="text-positive" />
            <h3 className="font-medium text-white">Import complete</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold text-white">{result.holdings_upserted}</p>
              <p className="text-xs text-muted mt-1">Holdings updated</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{result.transactions_inserted}</p>
              <p className="text-xs text-muted mt-1">Transactions added</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{result.skipped}</p>
              <p className="text-xs text-muted mt-1">Duplicates skipped</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-4 space-y-1">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-negative font-mono">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
