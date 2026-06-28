"use client";

import { useEffect, useState } from "react";
import { CalendarDays, RefreshCw, Plus, X } from "lucide-react";
import {
  getReservations,
  updateReservation,
  createReservation,
  getTables,
  type Reservation,
  type DiningTable,
} from "@/lib/api";

const STATUS_CONFIG = {
  pending: { label: "Ожидает", bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
  confirmed: { label: "Подтверждено", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  completed: { label: "Завершено", bg: "bg-zinc-500/10", border: "border-zinc-500/30", text: "text-zinc-400" },
  cancelled: { label: "Отменено", bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400" },
};

const NEXT_STATUS: Record<string, Reservation["status"] | null> = {
  pending: "confirmed",
  confirmed: "completed",
  completed: null,
  cancelled: null,
};

const NEXT_LABEL: Record<string, string> = {
  pending: "Подтвердить",
  confirmed: "Завершить",
};

const EMPTY_FORM = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  date: "",
  time: "",
  guests_count: "2",
  table_id: "",
};

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [resData, tablesData] = await Promise.all([
        getReservations(),
        getTables(),
      ]);
      setReservations(resData.reservations);
      setTables(tablesData.tables);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleStatusChange(id: string, status: Reservation["status"]) {
    setUpdating(id);
    try {
      const data = await updateReservation(id, status);
      setReservations((prev) => prev.map((r) => r.id === id ? data.reservation : r));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка обновления");
    } finally {
      setUpdating(null);
    }
  }

  function openModal() {
    setForm(EMPTY_FORM);
    setCreateError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setCreateError("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const data = await createReservation({
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email || undefined,
        date: form.date,
        time: form.time,
        guests_count: Number(form.guests_count),
        table_id: form.table_id,
      });
      setReservations((prev) => [data.reservation, ...prev]);
      closeModal();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Ошибка создания");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarDays size={20} />
            Бронирования
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">Управление столами и бронированиями</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Обновить
          </button>
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition"
          >
            <Plus size={14} />
            Новая бронь
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-500">Загрузка...</div>
        ) : reservations.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">Нет бронирований</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="px-5 py-3 text-left font-medium">Дата и время</th>
                  <th className="px-5 py-3 text-left font-medium">Гость</th>
                  <th className="px-5 py-3 text-left font-medium">Телефон / Email</th>
                  <th className="px-5 py-3 text-left font-medium">Гостей</th>
                  <th className="px-5 py-3 text-left font-medium">Статус</th>
                  <th className="px-5 py-3 text-left font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => {
                  const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                  const nextStatus = NEXT_STATUS[r.status];
                  const isUpdating = updating === r.id;
                  return (
                    <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
                      <td className="px-5 py-3 text-white font-medium">
                        {r.date} <span className="text-zinc-400">{r.time}</span>
                      </td>
                      <td className="px-5 py-3 text-zinc-200">{r.customer_name}</td>
                      <td className="px-5 py-3">
                        <div className="text-zinc-400">{r.customer_phone}</div>
                        {r.customer_email && (
                          <div className="text-zinc-500 text-xs mt-0.5">{r.customer_email}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-200">{r.guests_count}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${cfg.bg} ${cfg.border} border ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {nextStatus && (
                            <button
                              onClick={() => handleStatusChange(r.id, nextStatus)}
                              disabled={isUpdating}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded-lg transition"
                            >
                              {isUpdating ? "..." : NEXT_LABEL[r.status]}
                            </button>
                          )}
                          {r.status !== "cancelled" && r.status !== "completed" && (
                            <button
                              onClick={() => handleStatusChange(r.id, "cancelled")}
                              disabled={isUpdating}
                              className="px-3 py-1.5 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50 text-zinc-400 text-xs rounded-lg transition"
                            >
                              Отменить
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Reservation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Новая бронь</h2>
              <button onClick={closeModal} className="text-zinc-400 hover:text-white transition">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-4 space-y-4">
              {createError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                  {createError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Имя гостя *</label>
                  <input
                    type="text"
                    required
                    value={form.customer_name}
                    onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                    placeholder="Иван Иванов"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Телефон *</label>
                  <input
                    type="tel"
                    required
                    value={form.customer_phone}
                    onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
                    placeholder="+7 999 000 00 00"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email (необязательно)</label>
                  <input
                    type="email"
                    value={form.customer_email}
                    onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))}
                    placeholder="guest@email.com"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Дата *</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Время *</label>
                  <input
                    type="time"
                    required
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Гостей *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={30}
                    value={form.guests_count}
                    onChange={(e) => setForm((f) => ({ ...f, guests_count: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Стол *</label>
                  <select
                    required
                    value={form.table_id}
                    onChange={(e) => setForm((f) => ({ ...f, table_id: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value="">Выберите стол</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        №{t.table_number} ({t.capacity} мест)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                >
                  {creating ? "Создание..." : "Создать бронь"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
