import { type LucideIcon } from "lucide-react";
import { clsx } from "clsx";

interface MetricCardProps {
  label:     string;
  value:     string | number | null;
  suffix?:   string;
  icon?:     LucideIcon;
  trend?:    "positive" | "negative" | "neutral";
  sub?:      string;
  loading?:  boolean;
}

export default function MetricCard({
  label, value, suffix, icon: Icon, trend = "neutral", sub, loading,
}: MetricCardProps) {
  const formatted =
    value === null || value === undefined ? "—"
    : typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : value;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-muted">{label}</p>
        {Icon && (
          <div className="p-1.5 rounded-lg bg-white/5">
            <Icon size={15} className="text-muted" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-8 w-24 bg-white/5 rounded animate-pulse" />
      ) : (
        <p className={clsx("text-2xl font-semibold", {
          "text-positive": trend === "positive",
          "text-negative": trend === "negative",
          "text-white":    trend === "neutral",
        })}>
          {formatted}
          {suffix && <span className="text-base font-normal text-muted ml-0.5">{suffix}</span>}
        </p>
      )}

      {sub && <p className="text-xs text-muted mt-1.5">{sub}</p>}
    </div>
  );
}
