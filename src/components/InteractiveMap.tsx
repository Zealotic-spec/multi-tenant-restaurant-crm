import React, { useState } from "react";
import { DiningTable, Reservation } from "../types";
import {
  Plus,
  Users,
  Clock,
  CalendarCheck2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface InteractiveMapProps {
  tables: DiningTable[];
  activeReservations: Reservation[];
  selectedTableId: string | null;
  onSelectTable: (tableId: string) => void;
  onQuickBook?: (table: DiningTable) => void;
  isAdminView?: boolean;
}

// Карта столов — та же простая сетка карточек, что и в клиентском портале (без "чертежа"
// и неоновых эффектов), чтобы у персонала и гостя был единый, узнаваемый визуальный язык.
export default function InteractiveMap({
  tables,
  activeReservations,
  selectedTableId,
  onSelectTable,
  onQuickBook,
}: InteractiveMapProps) {
  const [filter, setFilter] = useState<"all" | "free" | "reserved" | "occupied">("all");

  const statusDot: Record<DiningTable["current_status"], string> = {
    free: "bg-emerald-400",
    reserved: "bg-amber-400",
    occupied: "bg-red-500",
  };
  const statusText: Record<DiningTable["current_status"], string> = {
    free: "text-emerald-400",
    reserved: "text-amber-400",
    occupied: "text-red-400",
  };
  const statusLabel: Record<DiningTable["current_status"], string> = {
    free: "Свободен",
    reserved: "Есть брони",
    occupied: "Занят сейчас",
  };

  const filteredTables = tables.filter((table) => filter === "all" || table.current_status === filter);

  const freeCount = tables.filter((t) => t.current_status === "free").length;
  const reservedCount = tables.filter((t) => t.current_status === "reserved").length;
  const occupiedCount = tables.filter((t) => t.current_status === "occupied").length;

  const getTableReservation = (tableId: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    return activeReservations.find(
      (res) => res.table_id === tableId && res.date === todayStr && res.status !== "cancelled"
    );
  };

  return (
    <div className="space-y-4">

      {/* Фильтр по статусу */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all border ${
            filter === "all"
              ? "bg-indigo-500 text-slate-950 border-indigo-400"
              : "bg-zinc-900/60 text-slate-400 border-zinc-800 hover:text-white"
          }`}
        >
          Все ({tables.length})
        </button>
        <button
          onClick={() => setFilter("free")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all border flex items-center gap-1.5 ${
            filter === "free"
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
              : "bg-zinc-900/60 text-slate-400 border-zinc-800 hover:text-emerald-400"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Свободные ({freeCount})
        </button>
        <button
          onClick={() => setFilter("reserved")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all border flex items-center gap-1.5 ${
            filter === "reserved"
              ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
              : "bg-zinc-900/60 text-slate-400 border-zinc-800 hover:text-amber-400"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> С бронью ({reservedCount})
        </button>
        <button
          onClick={() => setFilter("occupied")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all border flex items-center gap-1.5 ${
            filter === "occupied"
              ? "bg-red-500/15 text-red-400 border-red-500/40"
              : "bg-zinc-900/60 text-slate-400 border-zinc-800 hover:text-red-400"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Занятые ({occupiedCount})
        </button>
      </div>

      {/* Сетка столов — карточки, как в клиентском портале */}
      {filteredTables.length === 0 ? (
        <div className="py-10 text-center text-slate-500 text-xs font-mono uppercase bg-zinc-900/40 border border-zinc-900 rounded-2xl">
          Нет столов с этим статусом.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredTables.map((table) => {
            const isSelected = selectedTableId === table.id;
            return (
              <motion.button
                key={table.id}
                type="button"
                onClick={() => onSelectTable(table.id)}
                whileTap={{ scale: 0.97 }}
                className={`relative rounded-2xl p-4 text-left transition-all cursor-pointer border
                  ${table.current_status === "occupied"
                    ? "bg-red-950/15 border-red-500/20"
                    : isSelected
                    ? "bg-indigo-500/15 border-indigo-500/50"
                    : "bg-zinc-900/60 border-zinc-800 hover:border-indigo-500/40"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl font-black text-white">Т{table.table_number}</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${statusDot[table.current_status]}`} />
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {table.capacity} мест
                </div>
                <div className={`text-[10px] font-semibold mt-1.5 ${statusText[table.current_status]}`}>
                  {statusLabel[table.current_status]}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Карточка выбранного стола */}
      <AnimatePresence mode="wait">
        {selectedTableId && (() => {
          const selectedTable = tables.find((t) => t.id === selectedTableId);
          if (!selectedTable) return null;

          const bindRes = getTableReservation(selectedTable.id);

          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-indigo-500/40 bg-indigo-500/10 shrink-0">
                    <span className="text-lg font-black text-white">№{selectedTable.table_number}</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      Стол №{selectedTable.table_number} · {selectedTable.capacity} мест
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border bg-zinc-950 ${statusText[selectedTable.current_status]} border-zinc-800`}>
                        {statusLabel[selectedTable.current_status]}
                      </span>
                    </h4>
                    {bindRes ? (
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-400 mt-1.5">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <CalendarCheck2 className="w-3.5 h-3.5 text-indigo-400" />
                          {bindRes.customer_name}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          Бронь на {bindRes.time} сегодня
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 mt-1">
                        Стол доступен для брони или заказа в зале.
                      </p>
                    )}
                  </div>
                </div>

                {selectedTable.current_status === "free" && onQuickBook && (
                  <button
                    onClick={() => onQuickBook(selectedTable)}
                    className="w-full sm:w-auto px-4 py-2 bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-xs text-slate-950 font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Plus className="w-4 h-4 stroke-[3px]" />
                    Быстрая бронь
                  </button>
                )}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
