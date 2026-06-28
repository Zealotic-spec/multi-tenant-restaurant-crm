"use client";

import { useEffect, useState } from "react";
import { BarChart3, Users, CreditCard, TrendingDown, ShoppingBag } from "lucide-react";
import { getAnalytics, type AnalyticsResponse } from "@/lib/api";
import MetricCard from "@/components/cards/MetricCard";
import RevenueChart from "@/components/charts/RevenueChart";
import PaymentPieChart from "@/components/charts/PaymentPieChart";

function defaultFrom() {
  return new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
}
function defaultTo() {
  return new Date().toISOString().split("T")[0];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());

  async function load(f: string, t: string) {
    setLoading(true);
    setError("");
    try {
      const result = await getAnalytics(f, t);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(from, to); }, []);

  function handleApply() {
    if (from && to) load(from, to);
  }

  if (error) return <ErrorBlock msg={error} />;
  if (loading && !data) return <PageLoader />;
  if (!data) return null;

  const { summary, payment_methods, daily } = data;

  function fmt(n: number) {
    return n.toLocaleString("ru");
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Аналитика и Финансы</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Финансовые показатели за выбранный период</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
          <span className="text-zinc-500 text-sm">—</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleApply}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            {loading ? "..." : "Применить"}
          </button>
        </div>
      </div>

      {/* Метрики */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <MetricCard label="Выручка" value={`${fmt(summary.revenue)} ₸`} icon={BarChart3} color="#6366f1" />
        <MetricCard label="Прибыль" value={`${fmt(summary.profit)} ₸`} icon={TrendingDown} color="#10b981" />
        <MetricCard label="Средний чек" value={`${fmt(summary.avg_check)} ₸`} icon={CreditCard} color="#f59e0b" />
        <MetricCard label="Гостей" value={fmt(summary.guests_count)} icon={Users} color="#8b5cf6" />
        <MetricCard label="Заказов" value={fmt(summary.orders_count)} icon={ShoppingBag} color="#06b6d4" />
      </div>

      {/* Дополнительная метрика */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <TrendingDown size={22} className="text-amber-400" />
          </div>
          <div>
            <p className="text-zinc-400 text-sm">Фуд-кост</p>
            <p className="text-2xl font-bold text-white">{summary.food_cost_pct}%</p>
            <p className="text-xs text-zinc-500 mt-0.5">себестоимость продуктов</p>
          </div>
        </div>
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <RevenueChart data={daily} />
        </div>
        <PaymentPieChart data={payment_methods} />
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-8 w-48 bg-zinc-800 rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 bg-zinc-900 border border-zinc-800 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="h-80 bg-zinc-900 border border-zinc-800 rounded-2xl animate-pulse" />
    </div>
  );
}

function ErrorBlock({ msg }: { msg: string }) {
  return (
    <div className="p-6">
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-red-400">
        Ошибка загрузки: {msg}
      </div>
    </div>
  );
}
