"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DayData {
  date: string;
  revenue: number;
  profit: number;
}

function formatDate(d: string) {
  const dt = new Date(d);
  return `${dt.getDate()}.${dt.getMonth() + 1}`;
}

function formatMoney(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}К`;
  return String(v);
}

interface Props {
  data: DayData[];
  primaryColor?: string;
}

export default function RevenueChart({ data, primaryColor = "#6366F1" }: Props) {
  const formatted = data.map((d) => ({ ...d, dateLabel: formatDate(d.date) }));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-white font-semibold mb-4">Выручка и прибыль</h3>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={primaryColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="profit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="dateLabel" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={formatMoney} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(val: number) => [`${val.toLocaleString("ru")} ₸`, ""]}
          />
          <Area type="monotone" dataKey="revenue" name="Выручка" stroke={primaryColor} fill="url(#revenue)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="profit" name="Прибыль" stroke="#10b981" fill="url(#profit)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="w-3 h-0.5 rounded" style={{ backgroundColor: primaryColor }} />
          Выручка
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="w-3 h-0.5 bg-emerald-500 rounded" />
          Прибыль
        </div>
      </div>
    </div>
  );
}
