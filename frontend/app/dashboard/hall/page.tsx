"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { getHallStatus, type HallTable } from "@/lib/api";

const STATUS_CONFIG = {
  free: { label: "Свободен", bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-400", text: "text-emerald-400" },
  occupied: { label: "Занят", bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-400", text: "text-red-400" },
  bill_requested: { label: "Ждут счёт", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-400", text: "text-amber-400" },
};

export default function HallPage() {
  const [tables, setTables] = useState<HallTable[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getHallStatus();
      setTables(data.tables);
      setSyncedAt(data.synced_at);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const stats = {
    free: tables.filter((t) => t.status === "free").length,
    occupied: tables.filter((t) => t.status === "occupied").length,
    bill: tables.filter((t) => t.status === "bill_requested").length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Зал и Бронирование</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Статус столов · обновляется каждые 30 сек
            {lastUpdated && ` · ${lastUpdated.toLocaleTimeString("ru")}`}
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

      {/* Сводка */}
      <div className="flex gap-4 flex-wrap">
        <StatusBadge color="bg-emerald-400" label={`Свободно: ${stats.free}`} />
        <StatusBadge color="bg-red-400" label={`Занято: ${stats.occupied}`} />
        <StatusBadge color="bg-amber-400" label={`Ждут счёт: ${stats.bill}`} />
      </div>

      {/* Карта столов */}
      {tables.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 flex items-center justify-center text-zinc-500">
          {loading ? "Загрузка..." : "Нет данных о столах"}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {tables.map((table) => {
            const cfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.free;
            return (
              <div
                key={table.number}
                className={`${cfg.bg} border ${cfg.border} rounded-xl p-4 flex flex-col gap-2`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-bold text-lg">№{table.number}</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                </div>
                <p className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</p>
                {table.guests > 0 && (
                  <p className="text-zinc-400 text-xs">{table.guests} гостей</p>
                )}
                {table.waiter && (
                  <p className="text-zinc-500 text-xs truncate">{table.waiter}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {syncedAt && (
        <p className="text-zinc-600 text-xs">
          Синк iiko: {new Date(syncedAt).toLocaleString("ru")}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-zinc-300 text-sm">{label}</span>
    </div>
  );
}
