"use client";

import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

interface SnapshotPoint {
  time:        string;
  total_value: number;
}

interface PortfolioChartProps {
  data: SnapshotPoint[];
}

function fmt(val: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1,
  }).format(val);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-muted mb-1">{fmtDate(label)}</p>
      <p className="text-white font-semibold">{fmt(payload[0].value)}</p>
    </div>
  );
}

export default function PortfolioChart({ data }: PortfolioChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-muted text-sm">
        No snapshot data available
      </div>
    );
  }

  const first = data[0].total_value;
  const last  = data[data.length - 1].total_value;
  const up    = last >= first;

  const color = up ? "#10b981" : "#ef4444";

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1A1A28" vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={fmtDate}
          tick={{ fill: "#4B5563", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fill: "#4B5563", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="total_value"
          stroke={color}
          strokeWidth={2}
          fill="url(#grad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
