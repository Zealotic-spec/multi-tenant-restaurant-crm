"use client";

import { useEffect, useState } from "react";
import { BookOpen, Trash2, Pencil, Check, X } from "lucide-react";
import { getMenuItems, createMenuItem, updateMenuItem, deleteMenuItem, type MenuItem } from "@/lib/api";

export default function MenuEditorPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form for new item
  const [form, setForm] = useState({ name: "", price: "", category: "", description: "", is_available: true });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  // Inline edit
  const [editing, setEditing] = useState<string | null>(null);
  const [editPatch, setEditPatch] = useState<Partial<MenuItem>>({});

  async function load() {
    setLoading(true);
    try {
      const data = await getMenuItems();
      setItems(data.menu);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.price) { setFormError("Название и цена обязательны"); return; }
    setFormError("");
    setCreating(true);
    try {
      await createMenuItem({
        name: form.name,
        price: Number(form.price),
        category: form.category || undefined,
        description: form.description || undefined,
        is_available: form.is_available,
      });
      setForm({ name: "", price: "", category: "", description: "", is_available: true });
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Ошибка создания");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleAvailable(item: MenuItem) {
    try {
      const data = await updateMenuItem(item.id, { is_available: !item.is_available });
      setItems((prev) => prev.map((i) => i.id === item.id ? data.item : i));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    }
  }

  function startEdit(item: MenuItem) {
    setEditing(item.id);
    setEditPatch({ name: item.name, price: item.price, category: item.category, description: item.description });
  }

  async function saveEdit(id: string) {
    try {
      const data = await updateMenuItem(id, editPatch);
      setItems((prev) => prev.map((i) => i.id === id ? data.item : i));
      setEditing(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Удалить «${name}»?`)) return;
    try {
      await deleteMenuItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка удаления");
    }
  }

  // Group by category
  const categories = [...new Set(items.map((i) => i.category ?? "Без категории"))].sort();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <BookOpen size={20} />
          Редактор меню
        </h1>
        <p className="text-zinc-400 text-sm mt-0.5">Управление блюдами и ценами</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Форма добавления */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">Новое блюдо</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input
            placeholder="Название *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            placeholder="Цена (₸) *"
            type="number"
            min="0"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            placeholder="Категория"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            placeholder="Описание"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-indigo-500 sm:col-span-2"
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_available}
                onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
                className="w-4 h-4 rounded accent-indigo-500"
              />
              <span className="text-zinc-300 text-sm">Доступно</span>
            </label>
            <button
              type="submit"
              disabled={creating}
              className="ml-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition"
            >
              {creating ? "Добавление..." : "Добавить"}
            </button>
          </div>
          {formError && <p className="sm:col-span-3 text-red-400 text-xs">{formError}</p>}
        </form>
      </div>

      {/* Список по категориям */}
      {loading ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-500">Загрузка...</div>
      ) : (
        categories.map((cat) => {
          const catItems = items.filter((i) => (i.category ?? "Без категории") === cat);
          return (
            <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-800/50">
                <h3 className="text-zinc-300 font-semibold text-sm">{cat}</h3>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {catItems.map((item) => {
                    const isEditing = editing === item.id;
                    return (
                      <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition">
                        <td className="px-5 py-3 w-8">
                          <button
                            onClick={() => handleToggleAvailable(item)}
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                              item.is_available
                                ? "border-emerald-500 bg-emerald-500/20"
                                : "border-zinc-600 bg-transparent"
                            }`}
                            title={item.is_available ? "Доступно" : "Недоступно"}
                          >
                            {item.is_available && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                          </button>
                        </td>
                        <td className="px-5 py-3 text-zinc-200">
                          {isEditing ? (
                            <input
                              value={editPatch.name ?? ""}
                              onChange={(e) => setEditPatch({ ...editPatch, name: e.target.value })}
                              className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white text-sm w-full focus:outline-none focus:border-indigo-500"
                            />
                          ) : (
                            <span>{item.name}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-zinc-400 text-xs">{item.description}</td>
                        <td className="px-5 py-3 text-white font-semibold text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editPatch.price ?? 0}
                              onChange={(e) => setEditPatch({ ...editPatch, price: Number(e.target.value) })}
                              className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white text-sm w-24 text-right focus:outline-none focus:border-indigo-500"
                            />
                          ) : (
                            `${item.price.toLocaleString("ru")} ₸`
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(item.id)}
                                  className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => setEditing(null)}
                                  className="p-2 text-zinc-400 hover:bg-zinc-700 rounded-lg transition"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(item)}
                                  className="p-2 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => handleDelete(item.id, item.name)}
                                  className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}
