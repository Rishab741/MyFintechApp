"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import { ChevronLeft, ChevronRight } from "lucide-react";



const EVENT_FILTERS = [
  { label: "All",       value: ""             },
  { label: "Ledger",    value: "ledger"        },
  { label: "Ingest",    value: "ingest"        },
  { label: "API Keys",  value: "tenant.api_key"},
];

const PAGE_SIZE = 50;

export default function AuditPage() {
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useSWR(
    ["audit", filter, offset],
    async () => {
      const jwt = await getJwt();
      return engine.audit.logs(jwt, PAGE_SIZE, offset, filter || undefined);
    }
  );

  const total   = data?.total ?? 0;
  const entries = data?.entries ?? [];
  const pages   = Math.ceil(total / PAGE_SIZE);
  const page    = Math.floor(offset / PAGE_SIZE) + 1;

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Audit Log</h1>
        <p className="text-sm text-muted">{total.toLocaleString()} events</p>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
        {EVENT_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => { setFilter(value); setOffset(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === value
                ? "bg-accent/15 text-accent border border-accent/30"
                : "text-muted border border-border hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 text-xs font-medium text-muted uppercase">Time</th>
              <th className="px-4 py-3 text-xs font-medium text-muted uppercase">Event</th>
              <th className="px-4 py-3 text-xs font-medium text-muted uppercase">Resource</th>
              <th className="px-4 py-3 text-xs font-medium text-muted uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3.5 bg-white/5 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted text-sm">
                  No audit events found
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3 text-muted text-xs font-mono whitespace-nowrap">
                    {fmtDate(entry.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-white/5 px-2 py-0.5 rounded text-white">
                      {entry.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{entry.resource ?? "—"}</td>
                  <td className="px-4 py-3 text-muted text-xs max-w-xs truncate">
                    {Object.entries(entry.metadata)
                      .filter(([, v]) => v !== null && v !== undefined)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join("  ·  ")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted">Page {page} of {pages}</p>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
