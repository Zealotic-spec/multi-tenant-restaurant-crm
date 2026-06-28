"use client";

import { useEffect, useState, useCallback } from "react";
import { ChefHat, RefreshCw } from "lucide-react";
import { getOrders, updateOrderStatus, type Order } from "@/lib/api";

const COLUMNS: { status: Order["order_status"]; label: string; color: string }[] = [
  { status: "new", label: "Новые", color: "text-amber-400" },
  { status: "cooking", label: "Готовится", color: "text-blue-400" },
  { status: "ready", label: "Готово", color: "text-emerald-400" },
  { status: "delivered", label: "Выдано", color: "text-zinc-400" },
];

const NEXT_STATUS: Record<Order["order_status"], Order["order_status"] | null> = {
  new: "cooking",
  cooking: "ready",
  ready: "delivered",
  delivered: null,
};

const NEXT_LABEL: Record<string, string> = {
  new: "В готовку",
  cooking: "Готово",
  ready: "Выдать",
};

function fmt(n: number) {
  return n.toLocaleString("ru");
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "только что";
  if (diff < 60) return `${diff} мин назад`;
  return `${Math.floor(diff / 60)} ч назад`;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getOrders();
      setOrders(data.orders);
      setLastUpdated(new Date());
    } catch {
      // тихий фоновый сбой — не сбрасываем данные
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleAdvance(id: string, nextStatus: Order["order_status"]) {
    setUpdating(id);
    try {
      const data = await updateOrderStatus(id, nextStatus);
      setOrders((prev) => prev.map((o) => o.id === id ? { ...o, ...data.order } : o));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка обновления");
    } finally {
      setUpdating(null);
    }
  }

  const byStatus = (status: Order["order_status"]) => orders.filter((o) => o.order_status === status);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ChefHat size={20} />
            Кухня / Заказы
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            {lastUpdated ? `Обновлено: ${lastUpdated.toLocaleTimeString("ru")}` : "Загрузка..."}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Обновить
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map(({ status, label, color }) => {
          const col = byStatus(status);
          return (
            <div key={status} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className={`font-semibold text-sm ${color}`}>{label}</h2>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{col.length}</span>
              </div>

              {col.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center text-zinc-600 text-sm">
                  Нет заказов
                </div>
              ) : (
                col.map((order) => {
                  const nextStatus = NEXT_STATUS[order.order_status];
                  const isUpdating = updating === order.id;
                  return (
                    <div key={order.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-white font-semibold text-sm">
                            {order.table_id ? `Стол` : "Самовывоз"}
                          </p>
                          <p className="text-zinc-500 text-xs">{timeAgo(order.created_at)}</p>
                        </div>
                        <span className="text-zinc-200 font-bold text-sm">{fmt(order.total_amount)} ₸</span>
                      </div>

                      <ul className="space-y-1">
                        {order.items.map((item) => (
                          <li key={item.id} className="flex justify-between text-xs text-zinc-400">
                            <span>{item.dish_name} × {item.quantity}</span>
                            <span>{fmt(item.price_per_unit * item.quantity)} ₸</span>
                          </li>
                        ))}
                      </ul>

                      {nextStatus && (
                        <button
                          onClick={() => handleAdvance(order.id, nextStatus)}
                          disabled={isUpdating}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                        >
                          {isUpdating ? "..." : NEXT_LABEL[order.order_status]}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
