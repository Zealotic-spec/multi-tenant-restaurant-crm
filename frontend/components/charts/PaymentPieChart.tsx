"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface PaymentMethods {
  cash: number;
  card: number;
  sbp: number;
  other: number;
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#8b5cf6"];
const LABELS = ["Наличные", "Карта", "СБП/QR", "Другое"];

interface Props {
  data: PaymentMethods;
}

export default function PaymentPieChart({ data }: Props) {
  const total = data.cash + data.card + data.sbp + data.other;
  const chartData = [
    { name: "Наличные", value: data.cash },
    { name: "Карта", value: data.card },
    { name: "СБП/QR", value: data.sbp },
    { name: "Другое", value: data.other },
  ].filter((d) => d.value > 0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-white font-semibold mb-4">Методы оплаты</h3>
      {total === 0 ? (
        <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">Нет данных</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="45%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
              formatter={(val: number) => [`${val.toLocaleString("ru")} ₸`, ""]}
            />
            <Legend
              formatter={(value) => <span className="text-zinc-400 text-xs">{value}</span>}
              iconType="circle"
              iconSize={8}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
