"use client";

import { useEffect, useState } from "react";
import { getMenuStats, getStopList, type DishStat } from "@/lib/api";

export default function MenuPage() {
  const [menuData, setMenuData] = useState<{ top: DishStat[]; bottom: DishStat[] } | null>(null);
  const [stopList, setStopList] = useState<{ items: Array<{ name: string; reason: string }>; synced_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMenuStats(), getStopList()])
      .then(([menu, stop]) => {
        setMenuData(menu);
        setStopList(stop);
      })
      .finally(() => setLoading(false));
  }, []);

  const maxOrders = menuData?.top[0]?.orders_count ?? 1;

  if (loading) return (
    <div className="p-6">
      <div className="h-8 w-48 bg-zinc-800 rounded-lg animate-pulse mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-64 bg-zinc-900 border border-zinc-800 rounded-2xl animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Меню и Кухня</h1>
        <p className="text-zinc-400 text-sm mt-0.5">Аналитика за последние 7 дней</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Топ-5 блюд */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 lg:col-span-1">
          <h3 className="text-white font-semibold mb-4">Топ-5 хитов</h3>
          <div className="space-y-4">
            {(menuData?.top ?? []).slice(0, 5).map((dish, i) => (
              <div key={dish.dish_name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs w-4">{i + 1}</span>
                    <span className="text-white text-sm font-medium truncate max-w-[160px]">{dish.dish_name}</span>
                  </div>
                  <span className="text-zinc-300 text-sm font-medium">{dish.orders_count} шт</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${Math.round((dish.orders_count / maxOrders) * 100)}%` }}
                  />
                </div>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {dish.revenue.toLocaleString("ru")} ₸ · ср. готовка {dish.avg_cook_time} мин
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Аутсайдеры */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Аутсайдеры</h3>
          <div className="space-y-3">
            {(menuData?.bottom ?? []).slice(0, 5).map((dish) => (
              <div key={dish.dish_name} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                <div>
                  <p className="text-white text-sm">{dish.dish_name}</p>
                  <p className="text-zinc-500 text-xs">{dish.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-red-400 text-sm font-medium">{dish.orders_count} шт</p>
                  <p className="text-zinc-600 text-xs">{dish.revenue.toLocaleString("ru")} ₸</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Стоп-лист */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Стоп-лист</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              (stopList?.items?.length ?? 0) === 0
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {(stopList?.items?.length ?? 0) === 0 ? "Всё в наличии" : `${stopList!.items.length} позиций`}
            </span>
          </div>

          {(stopList?.items?.length ?? 0) === 0 ? (
            <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
              Все блюда доступны
            </div>
          ) : (
            <div className="space-y-2">
              {stopList!.items.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-white text-sm">{item.name}</p>
                    <p className="text-zinc-500 text-xs">{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {stopList?.synced_at && (
            <p className="text-zinc-600 text-xs mt-3">
              Обновлено: {new Date(stopList.synced_at).toLocaleTimeString("ru")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
