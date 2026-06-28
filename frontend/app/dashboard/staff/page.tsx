"use client";

import { useEffect, useState } from "react";
import { Trophy, Clock } from "lucide-react";
import { getStaffKpi, type StaffKpiRow } from "@/lib/api";

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffKpiRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStaffKpi()
      .then((d) => setStaff(d.staff))
      .finally(() => setLoading(false));
  }, []);

  const totalRevenue = staff.reduce((s, w) => s + Number(w.revenue), 0);
  const totalTips = staff.reduce((s, w) => s + Number(w.tips_amount), 0);

  const RANK_COLORS = ["text-amber-400", "text-zinc-300", "text-amber-600"];

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-zinc-800 rounded-lg animate-pulse" />
      {[1,2,3,4].map(i => <div key={i} className="h-20 bg-zinc-900 border border-zinc-800 rounded-2xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Персонал и KPI</h1>
        <p className="text-zinc-400 text-sm mt-0.5">Рейтинг официантов за 30 дней</p>
      </div>

      {/* Суммарно */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Всего официантов" value={staff.length} />
        <SummaryCard label="Общая выручка" value={`${totalRevenue.toLocaleString("ru")} ₸`} />
        <SummaryCard label="Чаевые (всего)" value={`${totalTips.toLocaleString("ru")} ₸`} />
        <SummaryCard
          label="Ср. чаевые / официант"
          value={staff.length > 0 ? `${Math.round(totalTips / staff.length).toLocaleString("ru")} ₸` : "—"}
        />
      </div>

      {/* Таблица рейтинга */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
          <Trophy size={16} className="text-amber-400" />
          <h3 className="text-white font-semibold">Рейтинг официантов</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">#</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Официант</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Заказов</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Выручка</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Чаевые</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Ср. время</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((w, i) => (
                <tr key={w.waiter_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
                  <td className="px-5 py-3.5">
                    <span className={`font-bold ${RANK_COLORS[i] ?? "text-zinc-400"}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center text-sm font-medium text-indigo-400 flex-shrink-0">
                        {w.waiter_name.charAt(0)}
                      </div>
                      <span className="text-white text-sm">{w.waiter_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right text-zinc-300 text-sm">{w.orders_count}</td>
                  <td className="px-5 py-3.5 text-right text-white text-sm font-medium">
                    {Number(w.revenue).toLocaleString("ru")} ₸
                  </td>
                  <td className="px-5 py-3.5 text-right text-emerald-400 text-sm">
                    {Number(w.tips_amount).toLocaleString("ru")} ₸
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 text-zinc-400 text-sm">
                      <Clock size={12} />
                      {w.avg_service_time} мин
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {staff.length === 0 && (
          <div className="py-12 text-center text-zinc-500">Нет данных по персоналу</div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4">
      <p className="text-zinc-400 text-xs mb-1">{label}</p>
      <p className="text-white font-bold text-lg">{value}</p>
    </div>
  );
}
