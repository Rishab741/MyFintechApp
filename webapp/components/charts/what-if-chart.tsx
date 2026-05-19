"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { WhatIfTimePoint } from "@/lib/engine";

interface Props {
  data:   WhatIfTimePoint[];
  symbol: string;
  amount: number;
}

function fmt(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-xl">
      <p className="text-muted mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-white font-medium">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function WhatIfChart({ data, symbol, amount }: Props) {
  // Thin out to max 120 points for performance
  const step  = Math.max(1, Math.floor(data.length / 120));
  const thinned = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const hasPortfolio  = thinned.some(d => d.portfolio > 0);
  const hasBenchmark  = thinned.some(d => d.benchmark > 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={thinned} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickFormatter={d => {
            const dt = new Date(d);
            return dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
          }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => <span className="text-muted">{value}</span>}
        />
        <Line
          type="monotone"
          dataKey="hypothetical"
          name={symbol}
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
        />
        {hasPortfolio && (
          <Line
            type="monotone"
            dataKey="portfolio"
            name="Your portfolio"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        )}
        {hasBenchmark && (
          <Line
            type="monotone"
            dataKey="benchmark"
            name="SPY"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 3 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
