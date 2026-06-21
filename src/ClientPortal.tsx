import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarCheck2, Clock, Users, Phone, User, MapPin,
  ShoppingBag, Plus, Minus, Trash2, CheckCircle2, AlertCircle,
  Store, Bike, UtensilsCrossed, Loader2, ChevronLeft, ArrowRight,
  CalendarDays, ShoppingCart, Check, Tag, Leaf, Star, Flame, Sparkles, Award, MessageSquare,
} from "lucide-react";
import { DiningTable, MenuItem } from "./types";

const API_BASE = "/api/v1";

// Единый стиль бейджей блюд (веган/хит/острое/новинка/премиум) — те же цвета и иконки,
// что и в CRM, чтобы визуальный язык гостя и персонала совпадал.
const BADGE_STYLES: Record<NonNullable<MenuItem["badge_color"]>, { classes: string; Icon: typeof Leaf }> = {
  emerald: { classes: "bg-emerald-500 text-emerald-950", Icon: Leaf },
  amber: { classes: "bg-amber-400 text-amber-950", Icon: Star },
  red: { classes: "bg-red-500 text-red-950", Icon: Flame },
  indigo: { classes: "bg-indigo-400 text-indigo-950", Icon: Sparkles },
  purple: { classes: "bg-purple-400 text-purple-950", Icon: Award },
};

interface ClientPortalProps { apiKey: string; }
interface BasketItem { name: string; price: number; quantity: number; }
type DeliveryType = "in_restaurant" | "takeaway" | "delivery";
interface Slot { time: string; available: boolean; reason?: string; }

// ─── Шаги бронирования ───────────────────────────────────────────────────────
type ReserveStep = "date" | "table" | "slot" | "details" | "done";

interface Location { id: string; name: string; api_key: string; }

export default function ClientPortal({ apiKey }: ClientPortalProps) {
  // activeApiKey — реальный ключ заведения, с которым сейчас работает портал. Изначально
  // совпадает с ключом из URL, но гость может переключиться на другое заведение той же сети
  // (если у основателя несколько ресторанов) — тогда обновляем и URL, чтобы при перезагрузке
  // страницы гость остался в том же, выбранном им, заведении, а не вернулся к первому.
  const [activeApiKey, setActiveApiKey] = useState(apiKey);
  const [restaurantName, setRestaurantName] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [switchingLocation, setSwitchingLocation] = useState(false);
  // Напоминание выбрать нужное заведение — показывается один раз при первом заходе,
  // если у этой сети больше одного ресторана (чтобы гость не забронировал/заказал не туда).
  const [showLocationReminder, setShowLocationReminder] = useState(false);
  const locationReminderShownRef = useRef(false);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  // Читаем ?view=order из URL чтобы сразу открыть нужную вкладку
  const initialView = (new URLSearchParams(window.location.search).get("view") === "order" ? "order" : "reserve") as "reserve" | "order";
  const [view, setView] = useState<"reserve" | "order">(initialView);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // ── Состояние пошагового бронирования ──
  const [step, setStep] = useState<ReserveStep>("date");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [guestCount, setGuestCount] = useState(2);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [confirmedReservation, setConfirmedReservation] = useState<any>(null);

  // ── Заказ / корзина ──
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("in_restaurant");
  const [orderName, setOrderName] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [orderTableId, setOrderTableId] = useState<string | null>(null);
  // Стол последней подтверждённой брони этого гостя — заказ "в зале" должен по умолчанию
  // привязываться именно к нему, а не предлагать заново выбирать стол из всей карты зала.
  const [reservedTableId, setReservedTableId] = useState<string | null>(null);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  };

  // ── Загрузка данных заведения (перезапускается при переключении ресторана) ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [restRes, tablesRes] = await Promise.all([
          fetch(`${API_BASE}/client/restaurant`, { headers: { "X-Restaurant-Key": activeApiKey } }),
          fetch(`${API_BASE}/client/tables`, { headers: { "X-Restaurant-Key": activeApiKey } }),
        ]);
        if (cancelled) return;
        if (!restRes.ok) {
          setLoadError(restRes.status === 401
            ? "Ссылка недействительна. Обратитесь к ресторану."
            : "Не удалось загрузить данные. Попробуйте обновить страницу.");
          return;
        }
        const restData = await restRes.json();
        const tablesData = tablesRes.ok ? await tablesRes.json() : { tables: [] };
        setRestaurantName(restData.name);
        setMenu(restData.menu || []);
        setTables(tablesData.tables || []);
        // Если у этой сети больше одного заведения — портал покажет переключатель локаций,
        // чтобы гость всегда понимал, в какой именно ресторан он бронирует/заказывает.
        const restaurantsList = restData.restaurants || [];
        setLocations(restaurantsList);
        if (!locationReminderShownRef.current && restaurantsList.length > 1) {
          locationReminderShownRef.current = true;
          setShowLocationReminder(true);
        }
      } catch {
        if (!cancelled) setLoadError("Сбой соединения. Проверьте интернет и обновите страницу.");
      } finally {
        if (!cancelled) { setInitialLoading(false); setSwitchingLocation(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeApiKey]);

  // ── Переключение на другое заведение той же сети ──
  const handleSwitchLocation = (newKey: string) => {
    if (newKey === activeApiKey || switchingLocation) return;

    // Корзина, выбранный стол и шаги бронирования относятся к конкретному заведению —
    // при смене ресторана их нужно сбросить, чтобы гость не забронировал стол не туда
    // и не заказал блюдо из меню другого ресторана по ошибке.
    setBasket([]);
    setOrderTableId(null);
    setReservedTableId(null);
    setShowTablePicker(false);
    setLastOrderId(null);
    setLastOrderTotal(0);
    setSelectedTable(null);
    setSelectedSlot(null);
    setConfirmedReservation(null);
    setStep("date");

    setSwitchingLocation(true);
    setActiveApiKey(newKey);

    // Обновляем URL, чтобы при перезагрузке страницы гость остался в выбранном заведении.
    const newPath = `/portal/${encodeURIComponent(newKey)}${view === "order" ? "?view=order" : ""}`;
    window.history.replaceState(null, "", newPath);
  };

  // ── Загрузка слотов при выборе стола и даты ──
  useEffect(() => {
    if (step !== "slot" || !selectedTable) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSlots([]);
    fetch(`${API_BASE}/client/slots?date=${selectedDate}&table_id=${selectedTable.id}`, {
      headers: { "X-Restaurant-Key": activeApiKey },
    })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setSlots(data.slots || []); })
      .catch(() => { if (!cancelled) showToast("Не удалось загрузить слоты.", "error"); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [step, selectedTable, selectedDate, activeApiKey]);

  // ── Сбросить шаги при смене даты ──
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedTable(null);
    setSelectedSlot(null);
    setStep("table");
  };

  // ── Подтверждение брони ──
  const handleConfirmReservation = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTable || !selectedSlot) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/client/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Restaurant-Key": activeApiKey },
        body: JSON.stringify({
          customer_name: customerName,
          customer_phone: customerPhone,
          date: selectedDate,
          time: selectedSlot,
          guests_count: guestCount,
          table_id: selectedTable.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfirmedReservation(data.reservation);
        setStep("done");
        showToast("Бронь успешно совершена! Мы вас ждём.");
        // Заказ "в зале" должен автоматически привязаться к этому столу, а не показывать
        // гостю карту зала заново — он уже выбрал и забронировал именно этот стол.
        setReservedTableId(selectedTable.id);
        setOrderTableId(selectedTable.id);
        setShowTablePicker(false);
      } else {
        showToast(data.error || "Не удалось оформить бронь.", "error");
        // Если конфликт — вернуть к выбору слота
        if (res.status === 409) {
          setSelectedSlot(null);
          setStep("slot");
        }
      }
    } catch {
      showToast("Сбой соединения.", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Корзина ──
  const addToBasket = (name: string, price: number) => {
    setBasket((prev) => {
      const ex = prev.find((i) => i.name === name);
      return ex ? prev.map((i) => i.name === name ? { ...i, quantity: i.quantity + 1 } : i)
                : [...prev, { name, price, quantity: 1 }];
    });
  };
  const decrement = (name: string) =>
    setBasket((prev) => prev.map((i) => i.name === name ? { ...i, quantity: i.quantity - 1 } : i).filter((i) => i.quantity > 0));
  const remove = (name: string) => setBasket((prev) => prev.filter((i) => i.name !== name));
  const basketTotal = basket.reduce((s, i) => s + i.price * i.quantity, 0);

  const handleSubmitOrder = async () => {
    if (basket.length === 0) return;
    if (deliveryType === "in_restaurant" && !orderTableId) {
      showToast("Выберите столик.", "error"); return;
    }
    if (deliveryType === "delivery" && !deliveryAddress.trim()) {
      showToast("Укажите адрес доставки.", "error"); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/client/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Restaurant-Key": activeApiKey },
        body: JSON.stringify({
          total_amount: basketTotal,
          delivery_type: deliveryType,
          delivery_address: deliveryType === "delivery" ? deliveryAddress.trim() : undefined,
          table_id: deliveryType === "in_restaurant" ? orderTableId : undefined,
          customer_name: orderName || undefined,
          customer_phone: orderPhone || undefined,
          items: basket.map((i) => ({ dish_name: i.name, quantity: i.quantity, price_per_unit: i.price })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastOrderId(data.order_id);
        setLastOrderTotal(basketTotal);
        setBasket([]);
        showToast("Заказ успешно создан! Останется оплатить — и он уйдёт на кухню.");
      } else {
        showToast(data.error || "Не удалось создать заказ.", "error");
      }
    } catch {
      showToast("Сбой соединения.", "error");
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
          idemp_key: `portal_${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
          status: "success",
          amount: lastOrderTotal,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Оплата принята! Заказ передан на кухню.");
        setLastOrderId(null);
      } else {
        showToast(data.error || "Платёж не прошёл.", "error");
      }
    } catch {
      showToast("Ошибка платёжного шлюза.", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Форматирование даты ──
  const formatDate = (d: string) => new Date(d + "T00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  if (initialLoading) return (
    <div className="min-h-screen bg-[#0a0a0d] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
    </div>
  );

  if (loadError) return (
    <div className="min-h-screen bg-[#0a0a0d] flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4 bg-zinc-950 border border-red-500/20 rounded-3xl p-8">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <h1 className="text-lg font-bold text-white">Не удалось открыть страницу</h1>
        <p className="text-sm text-slate-400">{loadError}</p>
      </div>
    </div>
  );

  // ─── ПРОГРЕСС-БАР БРОНИРОВАНИЯ ───────────────────────────────────────────
  const stepIndex: Record<ReserveStep, number> = { date: 0, table: 1, slot: 2, details: 3, done: 4 };
  const stepLabels = ["Дата", "Стол", "Время", "Данные"];

  return (
    <div className="min-h-screen bg-[#0a0a0d] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* НАПОМИНАНИЕ О ВЫБОРЕ ЗАВЕДЕНИЯ */}
      <AnimatePresence>
        {showLocationReminder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowLocationReminder(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-zinc-950 border border-amber-500/20 rounded-3xl p-6 space-y-4 shadow-2xl"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-bold">Проверьте заведение</h2>
                <p className="text-sm text-slate-400 mt-1">
                  У этой сети несколько ресторанов. Убедитесь, что вы оформляете бронь или заказ
                  именно в том заведении, куда собираетесь — выбор ниже всегда доступен в шапке.
                </p>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => { handleSwitchLocation(loc.api_key); setShowLocationReminder(false); }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer border
                      ${loc.api_key === activeApiKey
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                        : "bg-white/5 border-white/10 text-slate-300 hover:border-amber-500/30"}`}
                  >
                    {loc.name}
                    {loc.api_key === activeApiKey && <span className="text-[10px] text-amber-400 font-bold ml-2">сейчас выбрано</span>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowLocationReminder(false)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-2xl transition-all cursor-pointer active:scale-[0.98]"
              >
                Продолжить
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ТОСТ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.25 }}
            className={`fixed top-4 left-4 right-4 z-50 px-4 py-3.5 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] border text-sm font-semibold text-center backdrop-blur-md flex items-center justify-center gap-2
              ${toast.type === "success" ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-300"
              : toast.type === "error" ? "bg-red-950/90 border-red-500/30 text-red-300"
              : "bg-zinc-900/90 border-amber-500/30 text-amber-300"}`}>
            {toast.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {toast.type === "error" && <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ШАПКА */}
      <header className="border-b border-white/5 bg-[#0a0a0d]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="px-4 py-4 flex items-center justify-between max-w-2xl mx-auto gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight truncate">{restaurantName || "Ресторан"}</h1>
            {locations.length > 1 ? (
              <label className="flex items-center gap-1 mt-1 cursor-pointer">
                <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                <select
                  value={activeApiKey}
                  disabled={switchingLocation}
                  onChange={(e) => handleSwitchLocation(e.target.value)}
                  className="text-[11px] text-slate-400 bg-transparent border-none outline-none cursor-pointer disabled:opacity-50 max-w-[140px] truncate"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.api_key} className="bg-zinc-900 text-white">
                      {loc.name}
                    </option>
                  ))}
                </select>
                {switchingLocation && <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />}
              </label>
            ) : (
              <p className="text-[11px] text-slate-500 mt-0.5">Онлайн-бронирование и заказ</p>
            )}
          </div>
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 shrink-0">
            <button onClick={() => setView("reserve")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1
                ${view === "reserve" ? "bg-amber-500 text-black" : "text-slate-400"}`}>
              <CalendarDays className="w-3.5 h-3.5" /> Бронь
            </button>
            <button onClick={() => setView("order")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1
                ${view === "order" ? "bg-amber-500 text-black" : "text-slate-400"}`}>
              <ShoppingCart className="w-3.5 h-3.5" /> Заказ
              {basket.length > 0 && (
                <span className="bg-amber-400 text-black text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {basket.reduce((s, i) => s + i.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">

        {/* ═══════════════════ БРОНИРОВАНИЕ ═══════════════════ */}
        {view === "reserve" && (
          <div className="space-y-6">

            {/* ПРОГРЕСС */}
            {step !== "done" && (
              <div className="flex items-center gap-0">
                {stepLabels.map((label, i) => (
                  <div key={i} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                        ${stepIndex[step] > i ? "bg-amber-500 text-black" : stepIndex[step] === i ? "bg-amber-500 text-black ring-4 ring-amber-500/20" : "bg-white/10 text-slate-500"}`}>
                        {stepIndex[step] > i ? <Check className="w-3.5 h-3.5 stroke-[3px]" /> : i + 1}
                      </div>
                      <span className={`text-[10px] font-semibold ${stepIndex[step] >= i ? "text-amber-400" : "text-slate-600"}`}>{label}</span>
                    </div>
                    {i < stepLabels.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 mb-4 transition-all ${stepIndex[step] > i ? "bg-amber-500" : "bg-white/10"}`} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── ШАГ 0: ВЫБОР ДАТЫ ── */}
            {step === "date" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">Выберите дату</h2>

                {/* Быстрые кнопки */}
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setSelectedDate(todayStr); setStep("table"); }}
                    className="bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/30 rounded-2xl p-4 text-left transition-all cursor-pointer">
                    <div className="text-xs text-slate-400 mb-1">Сегодня</div>
                    <div className="font-bold">{new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</div>
                  </button>
                  <button onClick={() => { setSelectedDate(tomorrowStr); setStep("table"); }}
                    className="bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/30 rounded-2xl p-4 text-left transition-all cursor-pointer">
                    <div className="text-xs text-slate-400 mb-1">Завтра</div>
                    <div className="font-bold">{new Date(Date.now() + 86400000).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</div>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-xs text-slate-500">или выберите</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                <input
                  type="date"
                  value={selectedDate}
                  min={todayStr}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-2xl p-4 outline-none text-sm transition-all"
                />

                <button onClick={() => setStep("table")}
                  className="w-full bg-amber-500 text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer">
                  Выбрать стол <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ── ШАГ 1: ВЫБОР СТОЛА ── */}
            {step === "table" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setStep("date")} className="text-slate-400 hover:text-white cursor-pointer">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-lg font-bold">Выберите стол</h2>
                    <p className="text-xs text-slate-400">{formatDate(selectedDate)}</p>
                  </div>
                </div>

                {tables.length === 0 ? (
                  <div className="bg-white/5 rounded-2xl p-10 text-center text-slate-500 text-sm">
                    Карта столов пока не настроена.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {tables.map((t) => {
                      const isFree = t.current_status === "free" || t.current_status === "reserved";
                      return (
                        <button key={t.id}
                          disabled={t.current_status === "occupied"}
                          onClick={() => { setSelectedTable(t); setSelectedSlot(null); setStep("slot"); }}
                          className={`relative rounded-2xl p-4 text-left transition-all cursor-pointer border
                            ${t.current_status === "occupied"
                              ? "bg-red-950/20 border-red-500/20 opacity-50 cursor-not-allowed"
                              : selectedTable?.id === t.id
                              ? "bg-amber-500/15 border-amber-500/50"
                              : "bg-white/5 border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xl font-black">Т{t.table_number}</span>
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              t.current_status === "free" ? "bg-emerald-400"
                              : t.current_status === "reserved" ? "bg-amber-400"
                              : "bg-red-500"}`} />
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {t.capacity} гостей
                          </div>
                          <div className={`text-[10px] font-semibold mt-1.5 ${
                            t.current_status === "free" ? "text-emerald-400"
                            : t.current_status === "reserved" ? "text-amber-400"
                            : "text-red-400"}`}>
                            {t.current_status === "free" ? "Свободен"
                              : t.current_status === "reserved" ? "Есть брони"
                              : "Занят сейчас"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Свободен</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Есть брони</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Занят</span>
                </div>
              </div>
            )}

            {/* ── ШАГ 2: ВЫБОР ВРЕМЕНИ ── */}
            {step === "slot" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setSelectedTable(null); setStep("table"); }} className="text-slate-400 hover:text-white cursor-pointer">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-lg font-bold">Выберите время</h2>
                    <p className="text-xs text-slate-400">
                      Стол №{selectedTable?.table_number} · {formatDate(selectedDate)}
                    </p>
                  </div>
                </div>

                <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-3 text-xs text-amber-300 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  Каждое бронирование занимает стол на 2 часа. Серые слоты недоступны.
                </div>

                {slotsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => (
                      <button key={slot.time}
                        disabled={!slot.available}
                        onClick={() => { setSelectedSlot(slot.time); setStep("details"); }}
                        title={slot.reason}
                        className={`py-3 rounded-xl text-sm font-bold transition-all cursor-pointer border
                          ${!slot.available
                            ? "bg-red-950/20 border-red-500/15 text-red-400/50 cursor-not-allowed line-through"
                            : selectedSlot === slot.time
                            ? "bg-amber-500 border-amber-400 text-black"
                            : "bg-white/5 border-white/10 hover:border-amber-400/40 hover:bg-amber-500/10"}`}>
                        {slot.time}
                        {!slot.available && <div className="text-[9px] font-normal mt-0.5 no-underline">занят</div>}
                      </button>
                    ))}
                  </div>
                )}

                {slots.length === 0 && !slotsLoading && (
                  <div className="text-center text-sm text-slate-500 py-8">
                    Не удалось загрузить расписание. Попробуйте ещё раз.
                  </div>
                )}
              </div>
            )}

            {/* ── ШАГ 3: ДАННЫЕ ГОСТЯ ── */}
            {step === "details" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setSelectedSlot(null); setStep("slot"); }} className="text-slate-400 hover:text-white cursor-pointer">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-lg font-bold">Ваши данные</h2>
                    <p className="text-xs text-slate-400">
                      Стол №{selectedTable?.table_number} · {selectedSlot} · {formatDate(selectedDate)}
                    </p>
                  </div>
                </div>

                {/* Карточка выбора */}
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-bold">Стол №{selectedTable?.table_number}</div>
                    <div className="text-slate-400 text-xs mt-0.5">{formatDate(selectedDate)} в {selectedSlot}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-bold text-amber-400">{selectedSlot} – {
                      (() => {
                        const [h, m] = (selectedSlot || "0:0").split(":").map(Number);
                        const end = h * 60 + m + 120;
                        return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
                      })()
                    }</div>
                    <div className="text-slate-500 text-xs">2 часа</div>
                  </div>
                </div>

                <form onSubmit={handleConfirmReservation} className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> Ваше имя *
                    </label>
                    <input required value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Имя гостя"
                      className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-2xl px-4 py-3.5 outline-none text-sm transition-all placeholder:text-slate-600" />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> Телефон *
                    </label>
                    <input required value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+7 777 000 00 00"
                      type="tel"
                      className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-2xl px-4 py-3.5 outline-none text-sm transition-all placeholder:text-slate-600" />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 mb-2 block flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> Количество гостей
                    </label>
                    <div className="flex items-center gap-4">
                      <button type="button" onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                        className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-all">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-2xl font-bold w-8 text-center">{guestCount}</span>
                      <button type="button" onClick={() => setGuestCount(Math.min(selectedTable?.capacity || 10, guestCount + 1))}
                        className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-all">
                        <Plus className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-slate-500">макс. {selectedTable?.capacity}</span>
                    </div>
                  </div>

                  <button type="submit" disabled={loading}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 mt-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck2 className="w-4 h-4" />}
                    Подтвердить бронирование
                  </button>
                </form>
              </div>
            )}

            {/* ── ШАГ 4: ГОТОВО ── */}
            {step === "done" && confirmedReservation && (
              <div className="text-center space-y-6 py-6">
                <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>

                <div>
                  <h2 className="text-2xl font-bold mb-2">Бронь подтверждена!</h2>
                  <p className="text-slate-400 text-sm">Мы ждём вас</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-left space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Стол</span>
                    <span className="font-bold">№{selectedTable?.table_number}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Дата</span>
                    <span className="font-bold">{formatDate(selectedDate)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Время</span>
                    <span className="font-bold text-amber-400">{selectedSlot}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Гостей</span>
                    <span className="font-bold">{guestCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Номер брони</span>
                    <span className="font-mono text-xs text-slate-400">#{confirmedReservation.id?.slice(-6).toUpperCase()}</span>
                  </div>
                </div>

                <button onClick={() => {
                    setStep("date");
                    setSelectedTable(null);
                    setSelectedSlot(null);
                    setConfirmedReservation(null);
                    setCustomerName(""); setCustomerPhone(""); setGuestCount(2);
                  }}
                  className="w-full border border-white/10 hover:border-white/20 text-slate-300 font-semibold py-3.5 rounded-2xl cursor-pointer transition-all">
                  Забронировать ещё
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════ ЗАКАЗ ═══════════════════ */}
        {view === "order" && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-amber-400" /> Меню
            </h2>

            {menu.length === 0 ? (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-10 text-center text-slate-500 text-sm">
                Меню пока не опубликовано.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {menu.map((item) => {
                  const badge = item.badge_color ? BADGE_STYLES[item.badge_color] : null;
                  const inBasket = basket.find((b) => b.name === item.name);
                  return (
                    <div key={item.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden flex flex-col">
                      {/* Полноразмерное фото с лентой-бейджем — как в референсном дизайне */}
                      <div className="relative h-40 bg-white/5 shrink-0">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <UtensilsCrossed className="w-6 h-6 text-slate-700" />
                          </div>
                        )}
                        {badge && (
                          <span className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wide shadow-lg ${badge.classes}`}>
                            <badge.Icon className="w-3 h-3" /> {item.badge_label}
                          </span>
                        )}
                      </div>

                      <div className="p-4 flex flex-col gap-2 flex-1">
                        {item.category && (
                          <span className="self-start text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Tag className="w-2.5 h-2.5" /> {item.category}
                          </span>
                        )}
                        <h3 className="font-bold text-sm leading-snug">{item.name}</h3>
                        {item.description && (
                          <p
                            className="text-[11px] text-slate-500 leading-relaxed"
                            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                          >
                            {item.description}
                          </p>
                        )}

                        <div className="mt-auto pt-3 flex items-center justify-between gap-2 border-t border-white/8">
                          <div>
                            <span className="text-[8px] text-slate-600 uppercase tracking-widest block">Стоимость</span>
                            <span className="text-sm font-bold text-amber-400">{item.price.toLocaleString("ru-RU")} ₸</span>
                          </div>
                          {inBasket ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => decrement(item.name)}
                                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-sm font-bold w-5 text-center">{inBasket.quantity}</span>
                              <button onClick={() => addToBasket(item.name, item.price)}
                                className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center cursor-pointer">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => addToBasket(item.name, item.price)}
                              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-3 py-2 rounded-xl cursor-pointer transition-all active:scale-95 shrink-0">
                              <ShoppingCart className="w-3.5 h-3.5" /> В заказ
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* КОРЗИНА */}
            {basket.length > 0 && !lastOrderId && (
              <div className="bg-zinc-950 border border-white/10 rounded-2xl p-5 space-y-4 sticky bottom-4">
                <h3 className="font-bold flex items-center gap-2 text-sm">
                  <ShoppingBag className="w-4 h-4 text-amber-400" /> Корзина
                </h3>
                <div className="space-y-2">
                  {basket.map((item) => (
                    <div key={item.name} className="flex items-center gap-3 text-sm">
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-slate-400 text-xs shrink-0">{item.quantity} × {item.price.toLocaleString("ru-RU")} ₸</span>
                      <button onClick={() => remove(item.name)}
                        className="text-red-400 hover:text-red-300 cursor-pointer shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between font-bold border-t border-white/8 pt-3">
                  <span>Итого</span>
                  <span className="text-amber-400">{basketTotal.toLocaleString("ru-RU")} ₸</span>
                </div>

                {/* Способ получения */}
                <div className="grid grid-cols-3 gap-2">
                  {([["in_restaurant", "В зале", UtensilsCrossed], ["takeaway", "Самовывоз", Store], ["delivery", "Доставка", Bike]] as const).map(([type, label, Icon]) => (
                    <button key={type} onClick={() => {
                        setDeliveryType(type as DeliveryType);
                        // Возвращаясь к "В зале" — снова предлагаем уже забронированный стол, а не пустой выбор.
                        if (type === "in_restaurant" && reservedTableId && !orderTableId) {
                          setOrderTableId(reservedTableId);
                          setShowTablePicker(false);
                        }
                      }}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer
                        ${deliveryType === type ? "bg-amber-500 text-black border-amber-400" : "bg-white/5 border-white/10 text-slate-400"}`}>
                      <Icon className="w-4 h-4" />{label}
                    </button>
                  ))}
                </div>

                {deliveryType === "in_restaurant" && (() => {
                  const reservedTable = reservedTableId ? tables.find((t) => t.id === reservedTableId && t.current_status !== "occupied") : undefined;

                  // Гость уже забронировал стол — заказ привязываем к нему автоматически,
                  // не предлагая заново выбирать из всей карты зала.
                  if (reservedTable && !showTablePicker) {
                    return (
                      <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
                        <div className="text-xs min-w-0">
                          <span className="text-slate-400">Заказ к вашему забронированному столу: </span>
                          <span className="font-bold text-amber-400">№{reservedTable.table_number}</span>
                        </div>
                        <button type="button" onClick={() => setShowTablePicker(true)}
                          className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer shrink-0 whitespace-nowrap">
                          Другой стол
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        {tables.filter((t) => t.current_status !== "occupied").map((t) => (
                          <button key={t.id} onClick={() => { setOrderTableId(t.id); setShowTablePicker(true); }}
                            className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer
                              ${orderTableId === t.id ? "bg-amber-500 text-black border-amber-400" : "bg-white/5 border-white/10 text-slate-400"}`}>
                            Стол №{t.table_number} ({t.capacity}п)
                          </button>
                        ))}
                      </div>
                      {reservedTable && (
                        <button type="button"
                          onClick={() => { setOrderTableId(reservedTable.id); setShowTablePicker(false); }}
                          className="text-[11px] text-slate-500 hover:text-white underline cursor-pointer">
                          Использовать забронированный стол №{reservedTable.table_number}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {deliveryType === "delivery" && (
                  <div className="space-y-2">
                    <input placeholder="Ваше имя" value={orderName} onChange={(e) => setOrderName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-xl px-3 py-2.5 text-sm outline-none" />
                    <input placeholder="Телефон" value={orderPhone} onChange={(e) => setOrderPhone(e.target.value)} type="tel"
                      className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-xl px-3 py-2.5 text-sm outline-none" />
                    <input placeholder="Адрес доставки" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-xl px-3 py-2.5 text-sm outline-none" />
                  </div>
                )}

                <button onClick={handleSubmitOrder} disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all active:scale-[0.98]">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Оформить заказ
                </button>
              </div>
            )}

            {/* ОПЛАТА */}
            {lastOrderId && (
              <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-5 text-center space-y-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <p className="font-bold">Заказ создан на {lastOrderTotal.toLocaleString("ru-RU")} ₸</p>
                <p className="text-sm text-slate-400">Оплатите чтобы заказ ушёл на кухню</p>
                <button onClick={handlePay} disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl cursor-pointer disabled:opacity-50 transition-all active:scale-[0.98]">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Оплатить →"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ФУТЕР: обратная связь + авторство */}
      <footer className="border-t border-white/10 px-4 py-4 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-500">
        <a
          href="mailto:askiloff10@gmail.com?subject=RestoCRM%20Feedback"
          className="flex items-center gap-1.5 hover:text-amber-400 transition-colors"
        >
          <MessageSquare className="w-3 h-3" />
          Оставить отзыв
        </a>
        <span className="text-slate-700">|</span>
        <span>Created by Marat Nurislam</span>
      </footer>
    </div>
  );
}
