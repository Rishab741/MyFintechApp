"use client";

import {
  Area, ComposedChart, CartesianGrid,
  Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { MonteCarloFan } from "@/lib/engine";

interface Props {
  fan:    MonteCarloFan;
  color:  string;
  height?: number;
}

function fmtK(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function MonteCarloChart({ fan, color, height = 180 }: Props) {
  const n = fan.p50.length;
  if (n < 2) return null;

  /*
   * Recharts stacked Area trick for floating bands:
   * stack "base" (transparent) then "height" (filled) within the same stackId.
   * This renders a band between [base, base + height] rather than [0, value].
   */
  const data = fan.p50.map((_, i) => ({
    i,
    // Outer band base + height
    outer_base:   fan.p10[i] ?? 0,
    outer_height: Math.max(0, (fan.p90[i] ?? 0) - (fan.p10[i] ?? 0)),
    // Inner band base + height
    inner_base:   fan.p25[i] ?? 0,
    inner_height: Math.max(0, (fan.p75[i] ?? 0) - (fan.p25[i] ?? 0)),
    // Median
    median: fan.p50[i],
  }));

  const xTicks = [0, Math.floor(n / 2), n - 1];
  const xLabel = ["Now", "Mid", "End"];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="i"
          type="number"
          domain={[0, n - 1]}
          ticks={xTicks}
          tickFormatter={(_v, idx) => xLabel[xTicks.indexOf(_v)] ?? ""}
          tick={{ fill: "#607A93", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={fmtK}
          tick={{ fill: "#607A93", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip
          contentStyle={{ background: "#0E1D35", border: "1px solid rgba(14,165,233,0.15)", borderRadius: 8 }}
          labelStyle={{ color: "#607A93", fontSize: 11 }}
          formatter={(v: number, name: string) => {
            if (name === "median") return [fmtK(v), "Median (p50)"];
            return [null, null]; // hide bands from tooltip
          }}
        />

        {/* Outer band p10–p90 */}
        <Area dataKey="outer_base"   stackId="outer" fill="transparent" stroke="none" legendType="none" />
        <Area dataKey="outer_height" stackId="outer" fill={color} fillOpacity={0.08} stroke="none" legendType="none" />

        {/* Inner band p25–p75 */}
        <Area dataKey="inner_base"   stackId="inner" fill="transparent" stroke="none" legendType="none" />
        <Area dataKey="inner_height" stackId="inner" fill={color} fillOpacity={0.18} stroke="none" legendType="none" />

        {/* Median line */}
        <Line dataKey="median" stroke={color} strokeWidth={2} dot={false} type="monotone" legendType="none" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
