import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  trend?: number;
  color?: string;
}

export default function MetricCard({ label, value, sub, icon: Icon, trend, color = "#6366F1" }: MetricCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-zinc-400 text-sm">{label}</span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + "22" }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {sub && <span className="text-zinc-500 text-sm mb-0.5">{sub}</span>}
      </div>
      {trend !== undefined && (
        <p className={`text-xs mt-2 ${trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs прошлый период
        </p>
      )}
    </div>
  );
}
