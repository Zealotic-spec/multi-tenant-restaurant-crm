"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Copy,
  Check,
  Plus,
  RefreshCw,
  Building2,
  Key,
  FileText,
} from "lucide-react";
import {
  getAllRestaurants,
  getAllInviteCodes,
  createInviteCode,
  getSystemLogs,
  type RestaurantAdmin,
  type InviteCode,
  type ApiLog,
} from "@/lib/api";

type Tab = "restaurants" | "codes" | "logs";

export default function SuperAdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("restaurants");

  const [restaurants, setRestaurants] = useState<RestaurantAdmin[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [newCodeNote, setNewCodeNote] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [restRes, codesRes, logsRes] = await Promise.allSettled([
        getAllRestaurants(),
        getAllInviteCodes(),
        getSystemLogs(),
      ]);
      if (restRes.status === "fulfilled") setRestaurants(restRes.value.restaurants);
      if (codesRes.status === "fulfilled") setInviteCodes(codesRes.value.invite_codes);
      if (logsRes.status === "fulfilled") setLogs(logsRes.value.slice(0, 40));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) { router.push("/login"); return; }
    try {
      const user = JSON.parse(raw);
      if (user.role !== "super_admin") { router.push("/dashboard/analytics"); return; }
    } catch {
      router.push("/login");
      return;
    }
    loadAll();
  }, [router, loadAll]);

  async function handleGenerateCode() {
    setGeneratingCode(true);
    try {
      const data = await createInviteCode(newCodeNote || undefined);
      setInviteCodes((prev) => [data.invite_code, ...prev]);
      setNewCodeNote("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка создания кода");
    } finally {
      setGeneratingCode(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedValue(text);
      setTimeout(() => setCopiedValue(null), 2000);
    } catch { /* ignore */ }
  }

  const TABS: Array<{ id: Tab; label: string; Icon: typeof Building2 }> = [
    { id: "restaurants", label: "Рестораны", Icon: Building2 },
    { id: "codes", label: "Invite-коды", Icon: Key },
    { id: "logs", label: "Системные логи", Icon: FileText },
  ];

  if (loading) {
    return (
      <div className="p-12 text-center text-zinc-500">Загрузка...</div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield size={20} className="text-amber-400" />
            Super Admin
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">Управление платформой</p>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition"
        >
          <RefreshCw size={14} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${
              activeTab === id
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Icon size={14} />
            {label}
            {id === "restaurants" && (
              <span className="ml-1 text-xs bg-zinc-700 text-zinc-300 rounded-full px-1.5 py-0.5 leading-none">
                {restaurants.length}
              </span>
            )}
            {id === "codes" && (
              <span className="ml-1 text-xs bg-zinc-700 text-zinc-300 rounded-full px-1.5 py-0.5 leading-none">
                {inviteCodes.filter((c) => !c.used_at).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Restaurants */}
      {activeTab === "restaurants" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {restaurants.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">Нет ресторанов</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="px-5 py-3 text-left font-medium">Название</th>
                    <th className="px-5 py-3 text-left font-medium">API Key</th>
                    <th className="px-5 py-3 text-left font-medium">Статус</th>
                    <th className="px-5 py-3 text-left font-medium">Создан</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((r) => (
                    <tr key={r.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition ${r.archived_at ? "opacity-50" : ""}`}>
                      <td className="px-5 py-3 text-white font-medium">{r.name}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-400 font-mono text-xs">{r.api_key.slice(0, 16)}…</span>
                          <button
                            onClick={() => copyToClipboard(r.api_key)}
                            className="text-zinc-600 hover:text-zinc-400 transition flex-shrink-0"
                            title="Скопировать API Key"
                          >
                            {copiedValue === r.api_key
                              ? <Check size={12} className="text-emerald-400" />
                              : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {r.archived_at ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-500/10 border border-zinc-500/30 text-zinc-400">
                            Архив
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            Активен
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">
                        {new Date(r.created_at).toLocaleDateString("ru-RU")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invite Codes */}
      {activeTab === "codes" && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
            <input
              type="text"
              value={newCodeNote}
              onChange={(e) => setNewCodeNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !generatingCode && handleGenerateCode()}
              placeholder="Заметка (для кого код, опционально)"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              onClick={handleGenerateCode}
              disabled={generatingCode}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition whitespace-nowrap"
            >
              <Plus size={14} />
              {generatingCode ? "Создание..." : "Создать код"}
            </button>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {inviteCodes.length === 0 ? (
              <div className="p-12 text-center text-zinc-500">Нет invite-кодов</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="px-5 py-3 text-left font-medium">Код</th>
                      <th className="px-5 py-3 text-left font-medium">Заметка</th>
                      <th className="px-5 py-3 text-left font-medium">Статус</th>
                      <th className="px-5 py-3 text-left font-medium">Создан</th>
                      <th className="px-5 py-3 text-left font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {inviteCodes.map((code) => (
                      <tr
                        key={code.code}
                        className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition ${code.used_at ? "opacity-50" : ""}`}
                      >
                        <td className="px-5 py-3 font-mono text-sm text-white">{code.code}</td>
                        <td className="px-5 py-3 text-zinc-400">{code.note || "—"}</td>
                        <td className="px-5 py-3">
                          {code.used_at ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-500/10 border border-zinc-500/30 text-zinc-500">
                              Использован
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              Активен
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-zinc-400 text-xs">
                          {new Date(code.created_at).toLocaleDateString("ru-RU")}
                        </td>
                        <td className="px-5 py-3">
                          {!code.used_at && (
                            <button
                              onClick={() => copyToClipboard(code.code)}
                              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition"
                            >
                              {copiedValue === code.code
                                ? <><Check size={12} className="text-emerald-400" /> Скопировано</>
                                : <><Copy size={12} /> Копировать</>}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Logs */}
      {activeTab === "logs" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {logs.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">Нет записей</div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {logs.map((log) => {
                const isOk = !log.status || log.status < 400;
                const methodColor =
                  log.method === "GET" ? "text-blue-400" :
                  log.method === "POST" ? "text-emerald-400" :
                  log.method === "PATCH" ? "text-amber-400" :
                  log.method === "DELETE" ? "text-red-400" :
                  "text-zinc-400";
                return (
                  <div key={log.id} className="px-5 py-3 hover:bg-zinc-800/30 transition">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-xs font-mono font-bold w-9 ${isOk ? "text-emerald-400" : "text-red-400"}`}>
                        {log.status ?? "—"}
                      </span>
                      <span className={`text-xs font-mono font-semibold w-14 ${methodColor}`}>
                        {log.method}
                      </span>
                      <span className="text-xs text-zinc-200 font-mono flex-1 truncate">{log.url}</span>
                      <span className="text-xs text-zinc-600 flex-shrink-0">{log.timestamp}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-zinc-600">
                      {log.tenant_context && log.tenant_context !== "None" && (
                        <span>Тенант: <span className="text-zinc-500">{log.tenant_context}</span></span>
                      )}
                      {log.role && log.role !== "Guest" && (
                        <span>Роль: <span className="text-zinc-500">{log.role}</span></span>
                      )}
                      {log.auth_type && log.auth_type !== "No Credentials" && (
                        <span className="text-zinc-600">{log.auth_type}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
