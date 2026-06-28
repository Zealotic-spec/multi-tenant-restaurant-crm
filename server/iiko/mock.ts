// Реалистичные mock-данные для разработки без реального iiko apiLogin.
// Генерирует детерминированные данные за последние 30 дней для ресторана.

export function generateMockAnalytics(restaurantId: string, dateFrom: string, dateTo: string) {
  const days: DayAnalytics[] = [];
  const from = new Date(dateFrom);
  const to = new Date(dateTo);

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    // Пятница/суббота — пиковые дни, понедельник — тихий
    const dow = d.getDay(); // 0=вс, 6=сб
    const multiplier = (dow === 5 || dow === 6) ? 1.6 : dow === 1 ? 0.7 : 1.0;

    const guestsCount = Math.round((45 + Math.random() * 30) * multiplier);
    const avgCheck = 1200 + Math.round(Math.random() * 800);
    const revenue = guestsCount * avgCheck;
    const foodCostPct = 28 + Math.random() * 8;
    const profit = Math.round(revenue * (1 - foodCostPct / 100) * 0.6);

    days.push({
      date: dateStr,
      revenue,
      profit,
      avg_check: avgCheck,
      guests_count: guestsCount,
      orders_count: Math.round(guestsCount * 1.1),
      food_cost_pct: parseFloat(foodCostPct.toFixed(1)),
      cash_amount: Math.round(revenue * 0.15),
      card_amount: Math.round(revenue * 0.55),
      sbp_amount: Math.round(revenue * 0.25),
      other_amount: Math.round(revenue * 0.05),
    });
  }

  return days;
}

export function generateMockMenuStats(restaurantId: string, dateFrom: string, dateTo: string) {
  const dishes = [
    { name: "Стейк Рибай", category: "Горячее", base: 28, price: 2800, cook: 18 },
    { name: "Том Ям с креветками", category: "Супы", base: 22, price: 890, cook: 12 },
    { name: "Цезарь с курицей", category: "Салаты", base: 20, price: 650, cook: 7 },
    { name: "Бургер классический", category: "Горячее", base: 19, price: 590, cook: 10 },
    { name: "Тирамису", category: "Десерты", base: 17, price: 420, cook: 2 },
    { name: "Паста Карбонара", category: "Горячее", base: 15, price: 720, cook: 14 },
    { name: "Пицца Маргарита", category: "Пицца", base: 14, price: 680, cook: 16 },
    { name: "Борщ", category: "Супы", base: 12, price: 390, cook: 8 },
    { name: "Греческий салат", category: "Салаты", base: 11, price: 480, cook: 5 },
    { name: "Мороженое", category: "Десерты", base: 6, price: 250, cook: 1 },
    { name: "Хек запечённый", category: "Горячее", base: 5, price: 560, cook: 15 },
    { name: "Уха", category: "Супы", base: 4, price: 450, cook: 20 },
  ];

  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const days: MenuDayStat[] = [];

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    for (const dish of dishes) {
      const variance = 0.7 + Math.random() * 0.6;
      const orders = Math.round(dish.base * variance);
      days.push({
        date: dateStr,
        dish_name: dish.name,
        category: dish.category,
        orders_count: orders,
        revenue: orders * dish.price,
        avg_cook_time: dish.cook + Math.round(Math.random() * 3),
      });
    }
  }

  return days;
}

export function generateMockStopList(): StopListItem[] {
  const candidates = [
    { name: "Стейк Рибай", reason: "Нет говядины" },
    { name: "Том Ям с креветками", reason: "Нет креветок" },
    { name: "Авокадо-тост", reason: "Нет авокадо" },
  ];
  // Случайно берём 0-2 позиции из кандидатов
  const count = Math.floor(Math.random() * 3);
  return candidates.slice(0, count);
}

export function generateMockHallStatus(): HallTable[] {
  const statuses: Array<"free" | "occupied" | "bill_requested"> = ["free", "occupied", "bill_requested"];
  return Array.from({ length: 12 }, (_, i) => ({
    number: i + 1,
    status: Math.random() > 0.5 ? "occupied" : Math.random() > 0.5 ? "free" : "bill_requested",
    guests: Math.random() > 0.5 ? Math.floor(Math.random() * 4) + 1 : 0,
    waiter: Math.random() > 0.5 ? `Официант ${(i % 4) + 1}` : undefined,
  }));
}

export function generateMockStaffKpi(restaurantId: string, dateFrom: string, dateTo: string) {
  const waiters = [
    { id: "w1", name: "Алина Смирнова" },
    { id: "w2", name: "Иван Петров" },
    { id: "w3", name: "Мария Козлова" },
    { id: "w4", name: "Дмитрий Новиков" },
  ];

  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const rows: StaffKpiRow[] = [];

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    for (const w of waiters) {
      const orders = 8 + Math.round(Math.random() * 14);
      const revenue = orders * (1100 + Math.round(Math.random() * 600));
      rows.push({
        date: dateStr,
        waiter_id: w.id,
        waiter_name: w.name,
        orders_count: orders,
        revenue,
        tips_amount: Math.round(revenue * (0.05 + Math.random() * 0.07)),
        avg_service_time: 28 + Math.round(Math.random() * 20),
      });
    }
  }

  return rows;
}

export function generateMockPeakHours(restaurantId: string, dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const rows: PeakHourRow[] = [];

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    for (let h = 10; h <= 22; h++) {
      // Обед 12-14, ужин 18-21 — пиковые часы
      const isPeak = (h >= 12 && h <= 14) || (h >= 18 && h <= 21);
      const guests = isPeak
        ? 10 + Math.round(Math.random() * 20)
        : 2 + Math.round(Math.random() * 8);
      rows.push({
        date: dateStr,
        hour: h,
        guests_count: guests,
        orders_count: Math.round(guests * 0.9),
      });
    }
  }

  return rows;
}

export function generateMockFeedback(): FeedbackItem[] {
  const comments = [
    { rating: 5, comment: "Отличная еда и сервис! Обязательно вернёмся." },
    { rating: 5, comment: "Очень вкусный стейк. Официант был очень внимателен." },
    { rating: 4, comment: "Хорошее место, немного долго ждали заказ." },
    { rating: 4, comment: "Приятная атмосфера, вкусные блюда." },
    { rating: 3, comment: "Средне. Ожидал большего за такую цену." },
    { rating: 5, comment: "Лучший ресторан в городе!" },
    { rating: 2, comment: "Суп был холодным. Персонал не извинился." },
    { rating: 5, comment: "Отличная пицца! Быстрая доставка." },
  ];

  const names = ["Анна К.", "Иван П.", "Мария С.", "Алексей Д.", "Елена В.", "Сергей М."];

  return comments.map((c, i) => ({
    rating: c.rating,
    comment: c.comment,
    source: "qr_menu",
    guest_name: names[i % names.length],
    created_at: new Date(Date.now() - i * 86400000 * 2).toISOString(),
  }));
}

// ─── Типы mock-данных ──────────────────────────────────────────────────────────

export interface DayAnalytics {
  date: string;
  revenue: number;
  profit: number;
  avg_check: number;
  guests_count: number;
  orders_count: number;
  food_cost_pct: number;
  cash_amount: number;
  card_amount: number;
  sbp_amount: number;
  other_amount: number;
}

export interface MenuDayStat {
  date: string;
  dish_name: string;
  category: string;
  orders_count: number;
  revenue: number;
  avg_cook_time: number;
}

export interface StopListItem {
  name: string;
  reason: string;
}

export interface HallTable {
  number: number;
  status: "free" | "occupied" | "bill_requested";
  guests: number;
  waiter?: string;
}

export interface StaffKpiRow {
  date: string;
  waiter_id: string;
  waiter_name: string;
  orders_count: number;
  revenue: number;
  tips_amount: number;
  avg_service_time: number;
}

export interface PeakHourRow {
  date: string;
  hour: number;
  guests_count: number;
  orders_count: number;
}

export interface FeedbackItem {
  rating: number;
  comment: string;
  source: string;
  guest_name: string;
  created_at: string;
}
