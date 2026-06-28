"use client";

import { useEffect, useState } from "react";
import { UserCog, Trash2, RefreshCw, KeyRound } from "lucide-react";
import { getEmployees, createEmployee, deleteEmployee, resetEmployeePassword, type Employee } from "@/lib/api";

const ROLES = ["manager", "hostess", "chef"] as const;
const ROLE_LABELS: Record<string, string> = {
  manager: "Управляющий",
  hostess: "Хостес",
  chef: "Шеф-повар",
  founder: "Основатель",
};

export default function EmployeesPage() {
  const [staff, setStaff] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<typeof ROLES[number]>("manager");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  // Modal
  const [newPassword, setNewPassword] = useState<{ email: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getEmployees();
      setStaff(data.staff);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setCreating(true);
    try {
      await createEmployee(formEmail, formPassword, formRole);
      setFormEmail("");
      setFormPassword("");
      setFormRole("manager");
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Ошибка создания");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Удалить сотрудника ${email}?`)) return;
    setDeleting(id);
    try {
      await deleteEmployee(id);
      setStaff((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setDeleting(null);
    }
  }

  async function handleResetPassword(id: string) {
    setResetting(id);
    try {
      const data = await resetEmployeePassword(id);
      setNewPassword({ email: data.email, password: data.new_password });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка сброса пароля");
    } finally {
      setResetting(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <UserCog size={20} />
            Сотрудники
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">Управление персоналом ресторана</p>
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Форма добавления */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">Добавить сотрудника</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="Email"
            required
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            placeholder="Пароль"
            required
            minLength={8}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
          <select
            value={formRole}
            onChange={(e) => setFormRole(e.target.value as typeof ROLES[number])}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creating}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition"
          >
            {creating ? "Добавление..." : "Добавить"}
          </button>
          {formError && (
            <p className="sm:col-span-4 text-red-400 text-xs">{formError}</p>
          )}
        </form>
      </div>

      {/* Таблица */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-500">Загрузка...</div>
        ) : staff.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">Нет сотрудников</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="px-5 py-3 text-left font-medium">Email</th>
                <th className="px-5 py-3 text-left font-medium">Роль</th>
                <th className="px-5 py-3 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
                  <td className="px-5 py-3 text-zinc-200">{s.email}</td>
                  <td className="px-5 py-3">
                    <span className="text-zinc-400 text-xs bg-zinc-800 px-2.5 py-1 rounded-lg">
                      {ROLE_LABELS[s.role] ?? s.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {s.role !== "founder" && (
                        <>
                          <button
                            onClick={() => handleResetPassword(s.id)}
                            disabled={resetting === s.id}
                            className="p-2 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                            title="Сбросить пароль"
                          >
                            <KeyRound size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id, s.email)}
                            disabled={deleting === s.id}
                            className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                            title="Удалить"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Модальное окно с новым паролем */}
      {newPassword && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-white font-semibold">Новый пароль</h3>
            <p className="text-zinc-400 text-sm">
              Пароль для <span className="text-white">{newPassword.email}</span> сброшен.
              Сохраните его — повторно посмотреть невозможно.
            </p>
            <div className="bg-zinc-800 rounded-lg px-4 py-3 font-mono text-indigo-300 text-sm select-all">
              {newPassword.password}
            </div>
            <button
              onClick={() => setNewPassword(null)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
