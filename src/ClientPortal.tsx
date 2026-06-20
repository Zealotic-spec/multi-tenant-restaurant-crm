import { useEffect, useState, type FormEvent } from "react";
import {
  CalendarCheck2,
  Clock,
  Users,
  Phone,
  User,
  MapPin,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Store,
  Bike,
  UtensilsCrossed,
  Loader2,
} from "lucide-react";
import InteractiveMap from "./components/InteractiveMap";
import { DiningTable, MenuItem } from "./types";

const API_BASE = "/api/v1";

interface ClientPortalProps {
  apiKey: string;
}

interface BasketItem {
  name: string;
  price: number;
  quantity: number;
}

type DeliveryType = "in_restaurant" | "takeaway" | "delivery";

/**
 * Универсальный клиентский портал бронирования и заказа.
 * Один и тот же код обслуживает ЛЮБОЙ ресторан — конкретный tenant определяется
 * ключом из URL (/portal/:apiKey), который передаётся как X-Restaurant-Key.
 * Никаких захардкоженных названий заведений — всё подгружается из API брокера.
 */
export default function ClientPortal({ apiKey }: ClientPortalProps) {
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  const [view, setView] = useState<"reserve" | "order">("reserve");
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const [reservationForm, setReservationForm] = useState({
    customer_name: "",
    customer_phone: "",
    date: new Date().toISOString().split("T")[0],
    time: "19:00",
    guests_count: 2,
  });

  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [orderForm, setOrderForm] = useState({
    delivery_type: "in_restaurant" as DeliveryType,
    delivery_address: "",
    customer_name: "",
    customer_phone: "",
  });

  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Подгружаем профиль ресторана (имя + меню) и карту столов строго по ключу из URL —
  // тот же scoped эндпоинт, что использует демо-витрина CRM (X-Restaurant-Key).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [restRes, tablesRes] = await Promise.all([
          fetch(`${API_BASE}/client/restaurant`, { headers: { "X-Restaurant-Key": apiKey } }),
          fetch(`${API_BASE}/client/tables`, { headers: { "X-Restaurant-Key": apiKey } }),
        ]);
        if (cancelled) return;

        if (!restRes.ok) {
          setLoadError(
            restRes.status === 401
              ? "Ссылка недействительна. Обратитесь к ресторану за актуальной ссылкой на бронирование."
              : "Не удалось загрузить данные ресторана. Попробуйте обновить страницу."
          );
          return;
        }

        const restData = await restRes.json();
        const tablesData = tablesRes.ok ? await tablesRes.json() : { tables: [] };

        setRestaurantName(restData.name);
        setMenu(restData.menu || []);
        setTables(tablesData.tables || []);
      } catch {
        if (!cancelled) setLoadError("Сбой соединения с сервером. Проверьте интернет-подключение и обновите страницу.");
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const refreshTables = async () => {
    try {
      const res = await fetch(`${API_BASE}/client/tables`, { headers: { "X-Restaurant-Key": apiKey } });
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
      }
    } catch {
      // Тихий сбой обновления карты столов не должен ронять остальной UI.
    }
  };

  const handleCreateReservation = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTableId) {
      showToast("Выберите столик на карте зала, чтобы продолжить бронирование.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/client/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Restaurant-Key": apiKey },
        body: JSON.stringify({ ...reservationForm, table_id: selectedTableId }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Бронь подтверждена! Стол №${data.updated_table?.table_number ?? ""} ждёт вас ${reservationForm.date} в ${reservationForm.time}.`);
        setReservationForm({
          customer_name: "",
          customer_phone: "",
          date: new Date().toISOString().split("T")[0],
          time: "19:00",
          guests_count: 2,
        });
        setSelectedTableId(null);
        refreshTables();
      } else {
        showToast(data.error || "Не удалось оформить бронь.", "error");
      }
    } catch {
      showToast("Сбой соединения с сервером.", "error");
    } finally {
      setLoading(false);
    }
  };

  const addToBasket = (name: string, price: number) => {
    setBasket((prev) => {
      const exists = prev.find((i) => i.name === name);
      if (exists) return prev.map((i) => (i.name === name ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { name, price, quantity: 1 }];
    });
  };

  const decrementBasketItem = (name: string) => {
    setBasket((prev) =>
      prev
        .map((i) => (i.name === name ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const removeFromBasket = (name: string) => setBasket((prev) => prev.filter((i) => i.name !== name));

  const basketTotal = basket.reduce((acc, i) => acc + i.price * i.quantity, 0);

  const handleSubmitOrder = async () => {
    if (basket.length === 0) return;
    if (orderForm.delivery_type === "in_restaurant" && !selectedTableId) {
      showToast("Выберите столик на карте зала для заказа «в заведении».", "error");
      return;
    }
    if (orderForm.delivery_type === "delivery") {
      if (!orderForm.delivery_address.trim()) {
        showToast("Укажите адрес доставки.", "error");
        return;
      }
      if (!orderForm.customer_name.trim() || !orderForm.customer_phone.trim()) {
        showToast("Для доставки на дом укажите имя и телефон — курьеру нужно с кем связаться.", "error");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/client/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Restaurant-Key": apiKey },
        body: JSON.stringify({
          total_amount: basketTotal,
          delivery_type: orderForm.delivery_type,
          delivery_address: orderForm.delivery_type === "delivery" ? orderForm.delivery_address.trim() : undefined,
          table_id: orderForm.delivery_type === "in_restaurant" ? selectedTableId : undefined,
          customer_name: orderForm.customer_name || undefined,
          customer_phone: orderForm.customer_phone || undefined,
          items: basket.map((i) => ({ dish_name: i.name, quantity: i.quantity, price_per_unit: i.price })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastOrderId(data.order_id);
        setLastOrderTotal(basketTotal);
        setBasket([]);
        showToast("Заказ создан. Осталось оплатить — заказ сразу уйдёт на кухню.", "info");
      } else {
        showToast(data.error || "Не удалось создать заказ.", "error");
      }
    } catch {
      showToast("Сбой соединения с сервером.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!lastOrderId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/client/payments/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: lastOrderId,
          idemp_key: `portal_idemp_${Math.random().toString(36).substring(2, 11).toUpperCase()}`,
          status: "success",
          amount: lastOrderTotal,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Оплата принята! Заказ передан на кухню.");
        setLastOrderId(null);
        setSelectedTableId(null);
        refreshTables();
      } else {
        showToast(data.error || "Платёж не прошёл.", "error");
      }
    } catch {
      showToast("Ошибка платёжного шлюза.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4 bg-zinc-950 border border-red-500/20 rounded-3xl p-8">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h1 className="text-lg font-bold font-display text-white">Не удалось открыть страницу</h1>
          <p className="text-sm text-slate-400 font-sans">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0d] text-white font-sans">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 max-w-sm px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium ${
            toast.type === "success"
              ? "bg-emerald-950 border-emerald-500/30 text-emerald-300"
              : toast.type === "error"
              ? "bg-red-950 border-red-500/30 text-red-300"
              : "bg-zinc-900 border-amber-500/30 text-amber-300"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-900 bg-[#0a0a0d]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight">{restaurantName}</h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">Бронирование стола и заказ онлайн</p>
          </div>
          <div className="flex gap-2 bg-zinc-950 border border-zinc-900 rounded-xl p-1">
            <button
              onClick={() => setView("reserve")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all cursor-pointer ${
                view === "reserve" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              Бронь стола
            </button>
            <button
              onClick={() => setView("order")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all cursor-pointer ${
                view === "order" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              Заказ
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {view === "reserve" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 space-y-4 h-fit">
              <h2 className="text-sm font-bold font-display uppercase tracking-wide flex items-center gap-2">
                <CalendarCheck2 className="w-4 h-4 text-amber-400" /> Данные брони
              </h2>
              <form onSubmit={handleCreateReservation} className="space-y-3 text-sm">
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                    <User className="w-3.5 h-3.5" /> Ваше имя
                  </label>
                  <input
                    required
                    value={reservationForm.customer_name}
                    onChange={(e) => setReservationForm({ ...reservationForm, customer_name: e.target.value })}
                    className="w-full bg-[#050508] border border-zinc-800 focus:border-amber-400 rounded-xl p-3 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                    <Phone className="w-3.5 h-3.5" /> Телефон
                  </label>
                  <input
                    required
                    value={reservationForm.customer_phone}
                    onChange={(e) => setReservationForm({ ...reservationForm, customer_phone: e.target.value })}
                    className="w-full bg-[#050508] border border-zinc-800 focus:border-amber-400 rounded-xl p-3 outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1.5 block">Дата</label>
                    <input
                      type="date"
                      required
                      value={reservationForm.date}
                      onChange={(e) => setReservationForm({ ...reservationForm, date: e.target.value })}
                      className="w-full bg-[#050508] border border-zinc-800 focus:border-amber-400 rounded-xl p-3 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1.5 block">Время</label>
                    <input
                      type="time"
                      required
                      value={reservationForm.time}
                      onChange={(e) => setReservationForm({ ...reservationForm, time: e.target.value })}
                      className="w-full bg-[#050508] border border-zinc-800 focus:border-amber-400 rounded-xl p-3 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                    <Users className="w-3.5 h-3.5" /> Количество гостей
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={reservationForm.guests_count}
                    onChange={(e) => setReservationForm({ ...reservationForm, guests_count: Number(e.target.value) })}
                    className="w-full bg-[#050508] border border-zinc-800 focus:border-amber-400 rounded-xl p-3 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {selectedTableId ? "Забронировать выбранный стол" : "Выберите стол справа →"}
                </button>
              </form>
            </div>

            <div>
              <h2 className="text-sm font-bold font-display uppercase tracking-wide mb-3">Карта зала</h2>
              {tables.length === 0 ? (
                <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-10 text-center text-slate-500 text-sm">
                  Ресторан пока не настроил карту столов.
                </div>
              ) : (
                <InteractiveMap
                  tables={tables}
                  activeReservations={[]}
                  selectedTableId={selectedTableId}
                  onSelectTable={(id) => setSelectedTableId(id)}
                  onQuickBook={(tbl) => setSelectedTableId(tbl.id)}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Menu */}
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-sm font-bold font-display uppercase tracking-wide flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-amber-400" /> Меню
              </h2>
              {menu.length === 0 ? (
                <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-10 text-center text-slate-500 text-sm">
                  Меню пока не опубликовано.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {menu.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addToBasket(item.name, item.price)}
                      className="bg-zinc-950 border border-zinc-900 hover:border-amber-500/40 rounded-xl p-4 text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-sm">{item.name}</p>
                          {item.category && <p className="text-[10px] text-slate-500 uppercase mt-0.5">{item.category}</p>}
                        </div>
                        <Plus className="w-4 h-4 text-slate-600 group-hover:text-amber-400 shrink-0" />
                      </div>
                      <p className="text-amber-400 font-mono text-sm mt-2">{item.price.toLocaleString("ru-RU")} ₸</p>
                    </button>
                  ))}
                </div>
              )}

              {orderForm.delivery_type === "in_restaurant" && (
                <div className="pt-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Выберите столик</h3>
                  {tables.length === 0 ? (
                    <p className="text-xs text-slate-500">Карта зала пока не настроена.</p>
                  ) : (
                    <InteractiveMap
                      tables={tables}
                      activeReservations={[]}
                      selectedTableId={selectedTableId}
                      onSelectTable={(id) => setSelectedTableId(id)}
                      onQuickBook={(tbl) => setSelectedTableId(tbl.id)}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Basket / checkout */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 space-y-4 h-fit sticky top-24">
              <h2 className="text-sm font-bold font-display uppercase tracking-wide flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-400" /> Корзина
              </h2>

              {lastOrderId ? (
                <div className="space-y-3 text-center py-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <p className="text-sm text-slate-300">Заказ создан на сумму {lastOrderTotal.toLocaleString("ru-RU")} ₸.</p>
                  <button
                    onClick={handlePay}
                    disabled={loading}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    Оплатить заказ
                  </button>
                </div>
              ) : basket.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Корзина пуста. Добавьте блюда из меню слева.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {basket.map((item) => (
                      <div key={item.name} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{item.price.toLocaleString("ru-RU")} ₸ × {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => decrementBasketItem(item.name)} className="w-6 h-6 rounded bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center cursor-pointer">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-5 text-center text-xs font-mono">{item.quantity}</span>
                          <button onClick={() => addToBasket(item.name, item.price)} className="w-6 h-6 rounded bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center cursor-pointer">
                            <Plus className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeFromBasket(item.name)} className="w-6 h-6 rounded bg-red-950/30 hover:bg-red-950/50 flex items-center justify-center cursor-pointer ml-1">
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-zinc-900 pt-3 flex items-center justify-between text-sm font-bold">
                    <span>Итого</span>
                    <span className="font-mono text-amber-400">{basketTotal.toLocaleString("ru-RU")} ₸</span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Способ получения</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => setOrderForm({ ...orderForm, delivery_type: "in_restaurant" })}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-[10px] font-bold uppercase transition-all cursor-pointer border ${
                          orderForm.delivery_type === "in_restaurant" ? "bg-amber-500 text-slate-950 border-amber-400" : "bg-[#050508] text-slate-400 border-zinc-800"
                        }`}
                      >
                        <UtensilsCrossed className="w-4 h-4" /> В зале
                      </button>
                      <button
                        onClick={() => setOrderForm({ ...orderForm, delivery_type: "takeaway" })}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-[10px] font-bold uppercase transition-all cursor-pointer border ${
                          orderForm.delivery_type === "takeaway" ? "bg-amber-500 text-slate-950 border-amber-400" : "bg-[#050508] text-slate-400 border-zinc-800"
                        }`}
                      >
                        <Store className="w-4 h-4" /> Самовывоз
                      </button>
                      <button
                        onClick={() => setOrderForm({ ...orderForm, delivery_type: "delivery" })}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl text-[10px] font-bold uppercase transition-all cursor-pointer border ${
                          orderForm.delivery_type === "delivery" ? "bg-amber-500 text-slate-950 border-amber-400" : "bg-[#050508] text-slate-400 border-zinc-800"
                        }`}
                      >
                        <Bike className="w-4 h-4" /> Доставка
                      </button>
                    </div>
                  </div>

                  {orderForm.delivery_type === "delivery" && (
                    <div className="space-y-2">
                      <input
                        placeholder="Имя"
                        value={orderForm.customer_name}
                        onChange={(e) => setOrderForm({ ...orderForm, customer_name: e.target.value })}
                        className="w-full bg-[#050508] border border-zinc-800 focus:border-amber-400 rounded-xl p-2.5 text-sm outline-none transition-all"
                      />
                      <input
                        placeholder="Телефон"
                        value={orderForm.customer_phone}
                        onChange={(e) => setOrderForm({ ...orderForm, customer_phone: e.target.value })}
                        className="w-full bg-[#050508] border border-zinc-800 focus:border-amber-400 rounded-xl p-2.5 text-sm outline-none transition-all"
                      />
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 mt-2.5 shrink-0" />
                        <input
                          placeholder="Адрес доставки"
                          value={orderForm.delivery_address}
                          onChange={(e) => setOrderForm({ ...orderForm, delivery_address: e.target.value })}
                          className="w-full bg-[#050508] border border-zinc-800 focus:border-amber-400 rounded-xl p-2.5 text-sm outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleSubmitOrder}
                    disabled={loading}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    Оформить заказ
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-8 text-center">
        <p className="text-[10px] text-slate-600 font-mono">Powered by Multi-Tenant Restaurant CRM</p>
      </footer>
    </div>
  );
}
