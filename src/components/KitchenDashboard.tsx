import React, { useState, useEffect } from "react";
import { Order, OrderItem } from "../types";
import { 
  Clock, 
  Flame, 
  ArrowUpRight, 
  CheckCircle2, 
  AlertTriangle,
  Utensils, 
  Check, 
  FileText,
  Skull,
  ChefHat,
  MonitorPlay,
  Play
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface KitchenDashboardProps {
  orders: (Order & { items?: OrderItem[] })[];
  onUpdateStatus: (orderId: string, currentStatus: Order["order_status"]) => void;
  isLoading: boolean;
}

// Countdown timer item representation focusing on micro seconds/minutes updates
function KitchenTimerCard({ 
  order, 
  onNext 
}: { 
  key?: string;
  order: Order & { items?: OrderItem[] }; 
  onNext: () => void 
}) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isBreached, setIsBreached] = useState<boolean>(false);

  useEffect(() => {
    function calculateTime() {
      const createdTime = new Date(order.created_at).getTime();
      const slaMs = order.sla_minutes * 60 * 1000;
      const targetTime = createdTime + slaMs;
      const now = Date.now();
      const difference = Math.floor((targetTime - now) / 1000);

      if (difference <= 0) {
        setTimeLeft(Math.abs(difference));
        setIsBreached(true);
      } else {
        setTimeLeft(difference);
        setIsBreached(false);
      }
    }

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [order.created_at, order.sla_minutes]);

  // Format timer into neat readable digital dashboard values
  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // State colors mapping
  const statusLabels = {
    new: "В ОЧЕРЕДИ",
    cooking: "НА ПЛИТЕ",
    ready: "ГОТОВО",
    out_for_delivery: "КУРЬЕР В ПУТИ",
    delivered: "ПОДАНО"
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0,
        borderColor: isBreached ? "rgba(239, 68, 68, 0.45)" : "rgba(34, 197, 94, 0.2)"
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      className={`relative bg-zinc-900/90 border backdrop-blur-md rounded-xl p-5 shadow-[0_4px_30px_rgba(0,0,0,0.5)] overflow-hidden transition-all ${
        isBreached 
          ? "shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse" 
          : "hover:border-indigo-500/30"
      }`}
    >
      {/* SLA Breach Indicator overlay glow banner */}
      {isBreached && (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-red-600 to-rose-700 h-1.5 animate-pulse" />
      )}

      {/* Header Info */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold text-slate-500 uppercase">ПАРТИЯ</span>
            <span className="text-white text-sm font-bold font-mono tracking-widest">{order.id?.toUpperCase()?.split("_")?.[1] || "REF"}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1 flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-slate-300 border border-slate-700 font-semibold text-[9px]">
              {order.delivery_type === "in_restaurant"
                ? `СТОЛ #${order.table_id?.split("_")?.[2] || "КЛИЕНТ"}`
                : order.delivery_type === "delivery"
                ? "🚚 ДОСТАВКА"
                : "С СОБОЙ"}
            </span>
            <span className="text-slate-500">•</span>
            <span>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {order.delivery_type === "delivery" && (
            <div className="text-[10px] font-mono text-slate-500 mt-1 max-w-[220px] truncate">
              📍 {order.delivery_address} {order.customer_name ? `· ${order.customer_name}` : ""} {order.customer_phone ? `· ${order.customer_phone}` : ""}
            </div>
          )}
        </div>

        {/* Dynamic High Tech Cooking Time Flag */}
        <div className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
          isBreached 
            ? "bg-red-950/45 border-red-500/50 text-red-400" 
            : "bg-emerald-950/45 border-emerald-500/50 text-emerald-400"
        }`}>
          <Clock className={`w-3.5 h-3.5 ${isBreached ? "animate-spin" : ""}`} />
          <span className="font-mono text-xs font-bold tracking-widest">
            {isBreached ? `-${formatTimer(timeLeft)}` : formatTimer(timeLeft)}
          </span>
          {isBreached && <AlertTriangle className="w-3 h-3 text-red-400 animate-bounce" />}
        </div>
      </div>

      {/* List of items inside the order */}
      <div className="border-t border-b border-zinc-800/80 py-3 my-3 space-y-2.5 max-h-48 overflow-y-auto scrollbar-thin">
        {order.items?.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-2 text-xs">
            <div className="flex items-start gap-2">
              <span className="font-bold font-mono text-emerald-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-emerald-500/20">
                {item.quantity}x
              </span>
              <span className="text-slate-200 font-medium leading-relaxed">{item.dish_name}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tactile Big action touch-target for quick workspace flow */}
      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">СТАТУС</span>
          <span className={`text-xs font-bold font-mono ${
            order.order_status === "new"
              ? "text-sky-400"
              : order.order_status === "cooking"
              ? "text-amber-400 animate-pulse"
              : order.order_status === "out_for_delivery"
              ? "text-violet-400 animate-pulse"
              : "text-emerald-400"
          }`}>
            {statusLabels[order.order_status]}
          </span>
        </div>

        <button
          onClick={onNext}
          className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all active:scale-95 text-slate-950 font-mono ${
            order.order_status === "new"
              ? "bg-sky-400 hover:bg-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.2)] hover:shadow-[0_0_15px_rgba(56,189,248,0.4)]"
              : order.order_status === "cooking"
              ? "bg-amber-400 hover:bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.2)] hover:shadow-[0_0_15px_rgba(251,191,36,0.4)]"
              : order.order_status === "out_for_delivery"
              ? "bg-violet-400 hover:bg-violet-300 shadow-[0_0_10px_rgba(167,139,250,0.2)] hover:shadow-[0_0_15px_rgba(167,139,250,0.4)]"
              : "bg-emerald-400 hover:bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.2)] hover:shadow-[0_0_15px_rgba(52,211,153,0.4)]"
          }`}
        >
          {order.order_status === "new" ? (
            <>
              <span>ПРИНЯТЬ</span>
              <Play className="w-3.5 h-3.5 fill-current" />
            </>
          ) : order.order_status === "cooking" ? (
            <>
              <span>ГОТОВО</span>
              <Check className="w-3.5 h-3.5 stroke-[3px]" />
            </>
          ) : order.order_status === "ready" && order.delivery_type === "delivery" ? (
            <>
              <span>ОТПРАВИТЬ КУРЬЕРА</span>
              <ArrowUpRight className="w-3.5 h-3.5 stroke-[3px]" />
            </>
          ) : order.order_status === "out_for_delivery" ? (
            <>
              <span>ДОСТАВЛЕНО</span>
              <Check className="w-3.5 h-3.5 stroke-[3px]" />
            </>
          ) : (
            <>
              <span>ПОДАТЬ</span>
              <ArrowUpRight className="w-3.5 h-3.5 stroke-[3px]" />
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

export default function KitchenDashboard({ orders, onUpdateStatus, isLoading }: KitchenDashboardProps) {
  // Compute basic SLA analytics to display high-tech health dashboard
  const activeOrdersCount = orders.filter((o) => o.order_status !== "delivered").length;
  const cookingItemsCount = orders.filter((o) => o.order_status === "cooking").length;

  // Доставка на дом проходит дополнительный этап ready → out_for_delivery → delivered
  // (курьер в пути); "в заведении" и "с собой" идут прямо ready → delivered.
  const handleAdvanceStatus = (order: Order) => {
    let next: Order["order_status"] = "delivered";
    if (order.order_status === "new") {
      next = "cooking";
    } else if (order.order_status === "cooking") {
      next = "ready";
    } else if (order.order_status === "ready") {
      next = order.delivery_type === "delivery" ? "out_for_delivery" : "delivered";
    } else if (order.order_status === "out_for_delivery") {
      next = "delivered";
    }
    onUpdateStatus(order.id, next);
  };

  // Group columns for Kanban board
  const orderColumns: { key: Order["order_status"]; title: string; color: string; border: string; glow: string }[] = [
    { key: "new", title: "Новый / Оплачен 📡", color: "text-sky-400", border: "border-sky-500/20", glow: "shadow-[inset_0_0_10px_rgba(56,189,248,0.02)]" },
    { key: "cooking", title: "Готовится 🍳", color: "text-amber-400", border: "border-amber-500/20", glow: "shadow-[inset_0_0_10px_rgba(251,191,36,0.02)]" },
    { key: "ready", title: "Готов на раздаче 🍽️", color: "text-emerald-400", border: "border-emerald-500/20", glow: "shadow-[inset_0_0_10px_rgba(16,185,129,0.02)]" },
    { key: "out_for_delivery", title: "Курьер в пути 🚚", color: "text-violet-400", border: "border-violet-500/20", glow: "shadow-[inset_0_0_10px_rgba(167,139,250,0.02)]" }
  ];

  return (
    <div className="space-y-6">
      
      {/* HUD Analytics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl backdrop-blur-md shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-500 tracking-wider">ВСЕГО АКТИВНЫХ</span>
            <p className="text-2xl font-bold font-mono text-white mt-1">{activeOrdersCount} шт.</p>
          </div>
          <Flame className="w-8 h-8 text-amber-500 animate-pulse" />
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl backdrop-blur-md shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-500 tracking-wider">НА ПЛИТАХ СЕЙЧАС</span>
            <p className="text-2xl font-bold font-mono text-teal-400 mt-1">{cookingItemsCount} шт.</p>
          </div>
          <ChefHat className="w-8 h-8 text-teal-400 shrink-0" />
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl backdrop-blur-md shadow-lg flex items-center justify-between col-span-2">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-500 tracking-wider">СВЯЗЬ ОБНОВЛЕНИЯ SSE / WS</span>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-xs text-slate-300 font-mono">РЕАКТИВНЫЙ КАНАЛ СЛУШАТЕЛЯ СЛУЖБЫ АКТИВЕН (1000ms polling simulated)</p>
            </div>
          </div>
          <MonitorPlay className="w-8 h-8 text-slate-500 hidden sm:block" />
        </div>
      </div>

      {/* Large Kanban Grid workspace */}
      {isLoading ? (
        <div className="h-96 flex flex-col items-center justify-center gap-3 bg-zinc-900/40 rounded-xl border border-zinc-800">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-slate-500">ЗАГРУЗКА ПОВАРЕННОЙ КНИГИ И ЗАКАЗОВ...</p>
        </div>
      ) : orders.filter(o => o.order_status !== "delivered").length === 0 ? (
        <div className="h-80 flex flex-col items-center justify-center text-center bg-zinc-900/30 rounded-xl border border-zinc-800 border-dashed p-6">
          <ChefHat className="w-12 h-12 text-zinc-600 mb-2 animate-bounce" />
          <h4 className="text-sm font-bold text-white mb-1">Кухня простаивает — заказов нет</h4>
          <p className="text-xs text-slate-500 max-w-sm">
            Отправьте новый заказ в Корзине на вкладке "Симулятор Клиента (API)", оплатите его и он моментально вспыхнет здесь.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {orderColumns.map((col) => {
            const columnOrders = orders.filter((o) => o.order_status === col.key);

            return (
              <div 
                key={col.key} 
                className={`flex flex-col bg-zinc-950/40 rounded-xl border ${col.border} p-4 min-h-[500px] ${col.glow}`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold font-mono uppercase tracking-wider ${col.color}`}>
                      {col.title}
                    </span>
                  </div>
                  <span className="bg-zinc-900 px-2 py-0.5 rounded text-xs font-mono text-slate-400 font-bold">
                    {columnOrders.length}
                  </span>
                </div>

                {/* Queue of cards */}
                <div className="flex-1 space-y-4">
                  <AnimatePresence mode="popLayout">
                    {columnOrders.map((order) => (
                      <KitchenTimerCard
                        key={order.id}
                        order={order}
                        onNext={() => handleAdvanceStatus(order)}
                      />
                    ))}
                  </AnimatePresence>
                  
                  {columnOrders.length === 0 && (
                    <div className="h-40 border border-zinc-900 border-dashed rounded-xl flex items-center justify-center text-center p-4">
                      <span className="text-[11px] font-mono text-zinc-700 uppercase">Нет заказов</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
