"use client";

import { useState } from "react";
import useSWR from "swr";
import { engine } from "@/lib/engine";
import { getJwt } from "@/lib/jwt";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

const EVENT_FILTERS = [
  { label: "All",      value: ""              },
  { label: "Ledger",   value: "ledger"        },
  { label: "Ingest",   value: "ingest"        },
  { label: "API Keys", value: "tenant.api_key" },
];

const PAGE_SIZE = 50;

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  ledger:         { bg: "rgba(139,92,246,0.12)", text: "#A78BFA" },
  ingest:         { bg: "rgba(16,185,129,0.12)", text: "#34D399" },
  "tenant.api_key":{ bg: "rgba(245,158,11,0.12)", text: "#FCD34D" },
};

function eventStyle(type: string) {
  for (const [key, style] of Object.entries(EVENT_COLORS)) {
    if (type.startsWith(key)) return style;
  }
  return { bg: "rgba(255,255,255,0.05)", text: "#9CA3AF" };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AuditPage() {
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useSWR(
    ["audit", filter, offset],
    async () => engine.audit.logs(await getJwt(), PAGE_SIZE, offset, filter || undefined)
  );

  const total   = data?.total ?? 0;
  const entries = data?.entries ?? [];
  const pages   = Math.ceil(total / PAGE_SIZE);
  const page    = Math.floor(offset / PAGE_SIZE) + 1;

  const card = { background: "#111118", border: "1px solid #1A1A28" };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-white">Audit Log</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Immutable event history</p>
        </div>
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-[#4B5563]" />
          <span className="text-sm text-[#6B7280]">{total.toLocaleString()} events</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {EVENT_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => { setFilter(value); setOffset(0); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={
              filter === value
                ? { background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#A78BFA" }
                : { background: "transparent", border: "1px solid #1A1A28", color: "#6B7280" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={card}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #1A1A28" }}>
              {["Time", "Event", "Resource", "Details"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3.5 bg-white/5 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              : entries.length === 0
              ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[#4B5563] text-sm">
                    No audit events found
                  </td>
                </tr>
              )
              : entries.map((entry) => {
                  const es = eventStyle(entry.event_type);
                  return (
                    <tr
                      key={entry.id}
                      className="transition-colors"
                      style={{ borderTop: "1px solid #1A1A28" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.015)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
                    >
                      <td className="px-4 py-3 text-xs font-mono whitespace-nowrap text-[#6B7280]">
                        {fmtDate(entry.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-xs px-2 py-0.5 rounded"
                          style={{ background: es.bg, color: es.text }}
                        >
                          {entry.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#6B7280]">{entry.resource ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-[#4B5563] max-w-xs truncate">
                        {Object.entries(entry.metadata)
                          .filter(([, v]) => v !== null && v !== undefined)
                          .slice(0, 3)
                          .map(([k, v]) => `${k}=${String(v)}`)
                          .join("  ·  ")}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-[#6B7280]">Page {page} of {pages}</p>
          <div className="flex gap-2">
            {[
              { label: "← Prev", dir: -1, disabled: offset === 0 },
              { label: "Next →", dir: +1, disabled: offset + PAGE_SIZE >= total },
            ].map(({ label, dir, disabled }) => (
              <button
                key={label}
                disabled={disabled}
                onClick={() => setOffset(Math.max(0, offset + dir * PAGE_SIZE))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: "#111118", border: "1px solid #1A1A28", color: "#6B7280" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
