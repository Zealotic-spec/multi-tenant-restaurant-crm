import React, { useState } from "react";
import { DiningTable, Reservation } from "../types";
import { 
  Plus, 
  Users, 
  MapPin, 
  Clock, 
  Sparkles, 
  CheckCircle,
  AlertTriangle,
  Info,
  Layers,
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

export default function InteractiveMap({
  tables,
  activeReservations,
  selectedTableId,
  onSelectTable,
  onQuickBook,
  isAdminView = false
}: InteractiveMapProps) {
  const [filter, setFilter] = useState<"all" | "free" | "reserved" | "occupied">("all");
  const [hoveredTable, setHoveredTable] = useState<DiningTable | null>(null);

  // Status mapping for visual aesthetics and glowing shadow effects
  const statusStyles = {
    free: {
      label: "Свободен",
      glowBg: "bg-emerald-500",
      glowBorder: "border-emerald-500",
      glowGlint: "shadow-[0_0_15px_rgba(16,185,129,0.5),_0_0_3px_rgba(16,185,129,0.8)]",
      textColor: "text-emerald-400",
      pillBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    },
    reserved: {
      label: "Забронирован",
      glowBg: "bg-amber-500",
      glowBorder: "border-amber-500",
      glowGlint: "shadow-[0_0_15px_rgba(245,158,11,0.5),_0_0_3px_rgba(245,158,11,0.8)]",
      textColor: "text-amber-400",
      pillBg: "bg-amber-500/10 text-amber-400 border-amber-500/20"
    },
    occupied: {
      label: "Занят",
      glowBg: "bg-pink-500",
      glowBorder: "border-pink-500",
      glowGlint: "shadow-[0_0_15px_rgba(236,72,153,0.5),_0_0_3px_rgba(236,72,153,0.8)]",
      textColor: "text-pink-400",
      pillBg: "bg-pink-500/10 text-pink-400 border-pink-500/20"
    }
  };

  const filteredTables = tables.filter((table) => {
    if (filter === "all") return true;
    return table.current_status === filter;
  });

  // Calculate table density statistics
  const freeCount = tables.filter((t) => t.current_status === "free").length;
  const reservedCount = tables.filter((t) => t.current_status === "reserved").length;
  const occupiedCount = tables.filter((t) => t.current_status === "occupied").length;

  // Retrieve reservation binder details for hovered / selected card details
  const getTableReservation = (tableId: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    return activeReservations.find(
      (res) => res.table_id === tableId && res.date === todayStr && res.status !== "cancelled"
    );
  };

  return (
    <div className="space-y-4">
      
      {/* HUD Control Room Menu Filter Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/60 p-4 border border-zinc-900 rounded-xl backdrop-blur-md shadow-inner">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">ФИЛЬТР ЗАЛА:</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all ${
              filter === "all"
                ? "bg-zinc-800 text-white border border-zinc-700"
                : "bg-zinc-900/40 text-slate-500 border border-transparent hover:text-slate-300"
            }`}
          >
            ПОКАЗАТЬ ВСЕ ({tables.length})
          </button>
          
          <button
            onClick={() => setFilter("free")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
              filter === "free"
                ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.1)]"
                : "bg-zinc-900/40 text-slate-500 border border-transparent hover:text-emerald-400"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            СВОБОДНЫЕ ({freeCount})
          </button>

          <button
            onClick={() => setFilter("reserved")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
              filter === "reserved"
                ? "bg-amber-950/40 text-amber-400 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.1)]"
                : "bg-zinc-900/40 text-slate-500 border border-transparent hover:text-amber-400"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            К БРОНИИ ({reservedCount})
          </button>

          <button
            onClick={() => setFilter("occupied")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
              filter === "occupied"
                ? "bg-pink-950/40 text-pink-400 border border-pink-500/30 shadow-[0_0_8px_rgba(236,72,153,0.1)]"
                : "bg-zinc-900/40 text-slate-500 border border-transparent hover:text-pink-400"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
            ЗАНЯТЫЕ ({occupiedCount})
          </button>
        </div>
      </div>

      {/* Main floor blueprint environment stage */}
      <div className="relative bg-zinc-950/80 border border-zinc-900 rounded-2xl h-[400px] shadow-2xl p-6 overflow-hidden flex items-center justify-center">
        {/* Futuristic layout grid dots background */}
        <div 
          className="absolute inset-0 opacity-10" 
          style={{
            backgroundImage: "radial-gradient(circle, #4f46e5 1px, transparent 1px)",
            backgroundSize: "20px 20px"
          }}
        />

        {/* Ambient neon backdrop lighting flares */}
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-indigo-500/10 blur-[90px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-purple-500/10 blur-[90px] pointer-events-none" />

        {/* Outer stage structural layout markers */}
        <div className="absolute top-4 left-6 border-b border-r border-zinc-800 p-2 pointer-events-none rounded-br">
          <p className="text-[10px] font-mono font-bold text-zinc-600 tracking-widest uppercase">STAGE BLUEPRINT // STAGE 01</p>
        </div>
        <div className="absolute bottom-4 left-6 border-t border-r border-zinc-800 p-2 pointer-events-none rounded-tr">
          <p className="text-[9px] font-mono text-zinc-700 tracking-widest">CO-ORDINATES REF: EPSG-3857</p>
        </div>
        <div className="absolute top-4 right-6 border-b border-l border-zinc-800 p-2 pointer-events-none rounded-bl">
          <p className="text-[10px] font-mono font-bold text-slate-500 text-right">НЕОНОВЫЕ ИНДИКАТОРЫ</p>
        </div>

        {/* Floor stage map bounds render */}
        <div className="relative w-full h-full max-w-2xl">
          
          {/* Interactive table cards loop */}
          {filteredTables.map((table) => {
            const isSelected = selectedTableId === table.id;
            const style = statusStyles[table.current_status];
            const activeRes = getTableReservation(table.id);

            return (
              <motion.div
                key={table.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTable(table.id)}
                onMouseEnter={() => setHoveredTable(table)}
                onMouseLeave={() => setHoveredTable(null)}
                style={{
                  position: "absolute",
                  left: `${table.x_pos}%`,
                  top: `${table.y_pos}%`,
                  transform: "translate(-50%, -50%)"
                }}
                whileHover={{ scale: 1.1, zIndex: 10 }}
                animate={{
                  boxShadow: isSelected 
                    ? "0 0 25px rgba(99, 102, 241, 0.61)"
                    : "0 4px 6px -1px rgba(0,0,0,0.1)"
                }}
                className={`cursor-pointer w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 transition-all duration-300 bg-zinc-900/95 flex flex-col items-center justify-center p-2 group ${
                  isSelected 
                    ? "border-indigo-400 bg-indigo-950/20 scale-105" 
                    : `border-slate-800 hover:border-indigo-500/50`
                }`}
              >
                {/* Neon glow spot center indicator depending on occupation state */}
                <div className="absolute -top-1.5 right-1/2 translate-x-1/2 flex items-center justify-center pointer-events-none">
                  <span className={`w-3 h-3 rounded-full ${style.glowBg} ${style.glowGlint}`} />
                </div>

                {/* Table Number & seating cap metrics */}
                <span className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight mt-1.5">
                  Т{table.table_number}
                </span>

                <div className="flex items-center gap-1 mt-1 text-slate-400 group-hover:text-indigo-400 transition-colors">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-mono leading-none font-bold">{table.capacity}п</span>
                </div>

                {/* Status indicator pill text */}
                <span className={`text-[10px] font-mono tracking-wide mt-1.5 font-bold ${style.textColor}`}>
                  {style.label}
                </span>
                
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Side HUD Info Sheet / Dynamic detail drawer panel */}
      <AnimatePresence mode="wait">
        {selectedTableId && (() => {
          const selectedTable = tables.find((t) => t.id === selectedTableId);
          if (!selectedTable) return null;

          const style = statusStyles[selectedTable.current_status];
          const bindRes = getTableReservation(selectedTable.id);

          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-zinc-900/80 border border-zinc-800/80 p-5 rounded-xl backdrop-blur-md shadow-lg"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  {/* Glowing table icon preview */}
                  <div className={`w-14 h-14 rounded-lg flex items-center justify-center border-2 bg-zinc-950/50 ${isSelected => "border-indigo-500"} shrink-0`}>
                    <span className="text-2xl font-bold font-mono text-white">#{selectedTable.table_number}</span>
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      Стол №{selectedTable.table_number} (Мест: {selectedTable.capacity})
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border ${style.pillBg}`}>
                        {style.label}
                      </span>
                    </h4>

                    {bindRes ? (
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-400 mt-1.5">
                        <span className="flex items-center gap-1.5 font-mono text-slate-300">
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
                        В данный момент этот интерактивный стол полностью доступен для бронирования или экспресс-заказов в зале.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {selectedTable.current_status === "free" && onQuickBook && (
                    <button
                      onClick={() => onQuickBook(selectedTable)}
                      className="w-full sm:w-auto px-4 py-2 bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-xs text-slate-950 font-bold font-mono rounded-lg shadow-lg shadow-indigo-500/15 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-slate-950 stroke-[3px]" />
                      БЫСТРАЯ БРОНЬ
                    </button>
                  )}
                  <span className="text-[10px] font-mono text-zinc-500 uppercase hidden md:inline">TENANT LOCKED: {selectedTable.restaurant_id}</span>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
