"use client";

import {
  CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { SimTimePoint } from "@/lib/engine";

const PALETTE = ["#8FF5FF", "#AC89FF", "#F59E0B", "#10B981", "#F97316", "#6366F1"];

interface Props {
  timeseries: SimTimePoint[];
  height?: number;
}

export default function ComparisonChart({ timeseries, height = 280 }: Props) {
  if (!timeseries.length) return null;

  const keys = Object.keys(timeseries[0]).filter(k => k !== "date") as string[];

  // Index every series to 100 at its first non-zero value
  const bases: Record<string, number> = {};
  keys.forEach(k => {
    const first = timeseries.find(p => typeof p[k] === "number" && (p[k] as number) > 0);
    bases[k] = first ? (first[k] as number) : 1;
  });

  const data = timeseries.map(pt => {
    const row: Record<string, string | number> = { date: pt.date };
    keys.forEach(k => {
      const v = typeof pt[k] === "number" ? (pt[k] as number) : 0;
      row[k] = bases[k] > 0 ? +((v / bases[k]) * 100).toFixed(2) : 100;
    });
    return row;
  });

  const fmt = (v: number) => `${v >= 100 ? "+" : ""}${(v - 100).toFixed(1)}%`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="date"
          tickFormatter={v => v.slice(0, 7)}
          tick={{ fill: "#607A93", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          minTickGap={60}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fill: "#607A93", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{ background: "#0E1D35", border: "1px solid rgba(14,165,233,0.15)", borderRadius: 8 }}
          labelStyle={{ color: "#607A93", fontSize: 11, marginBottom: 4 }}
          formatter={(v: number, name: string) => [
            fmt(v),
            name === "actual" ? "Your Portfolio" : name.replace(/_/g, " "),
          ]}
          labelFormatter={v => `Date: ${v}`}
        />
        <Legend
          formatter={name => name === "actual" ? "Your Portfolio" : name.replace(/_/g, " ")}
          wrapperStyle={{ fontSize: 11, color: "#607A93", paddingTop: 8 }}
        />
        <ReferenceLine y={100} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 2" />
        {keys.map((k, i) => (
          <Line
            key={k}
            dataKey={k}
            stroke={PALETTE[i] ?? "#607A93"}
            strokeWidth={k === "actual" ? 2.5 : 1.8}
            dot={false}
            activeDot={{ r: 4, stroke: PALETTE[i], strokeWidth: 2 }}
            type="monotone"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
