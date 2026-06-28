import { Response } from "express";
import { SecureRequest } from "./middlewares/tenant";
import { db } from "./db";
import { sysLogs } from "./logs";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * GET /api/v1/crm/finance/months
 * Роли: founder, manager (см. requireRole в api.ts).
 * Список месяцев, за которые у этого тенанта есть заказы, с агрегатами для карточек архива.
 */
export async function crmGetFinanceMonths(req: SecureRequest, res: Response) {
  const restaurant_id = req.restaurant_id;
  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Unauthorized credentials." });
    return;
  }

  const months = await db.orders.findMonthsSummary(restaurant_id);
  res.json({ restaurant_id, months });
}

/**
 * GET /api/v1/crm/finance/export?month=YYYY-MM
 * Роли: founder, manager.
 * Возвращает ТОЛЬКО данные указанного месяца (строгий фильтр TO_CHAR(created_at,'YYYY-MM') = month) —
 * даже если месяц текущий и ещё не закончился, и даже спустя несколько дней нового месяца.
 */
export async function crmExportFinanceMonth(req: SecureRequest, res: Response) {
  const restaurant_id = req.restaurant_id;
  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Unauthorized credentials." });
    return;
  }

  const { month } = req.query as { month?: string };
  if (!month || !MONTH_RE.test(month)) {
    res.status(400).json({ error: "Параметр month обязателен и должен быть в формате YYYY-MM." });
    return;
  }

  const rawOrders = await db.orderItems.findByRestaurantWithItems(restaurant_id, { month });
  const ordersWithItems = rawOrders.map((order) => ({
    id: order.id,
    created_at: order.created_at,
    delivery_type: order.delivery_type,
    total_amount: order.total_amount,
    payment_status: order.payment_status,
    order_status: order.order_status,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    items: order.items.map((i) => ({ dish_name: i.dish_name, quantity: i.quantity, price: i.price_per_unit })),
  }));

  const paidOrders = ordersWithItems.filter((o) => o.payment_status === "paid");

  res.json({
    month,
    exported_at: new Date().toISOString(),
    orders: ordersWithItems,
    summary: {
      total_orders: ordersWithItems.length,
      paid_orders: paidOrders.length,
      total_revenue: ordersWithItems.reduce((sum, o) => sum + Number(o.total_amount), 0),
      paid_revenue: paidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0),
    },
  });
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Миллисекунды до следующих 04:00 UTC (сегодня, если ещё не наступило, иначе завтра). */
function msUntilNext4amUTC(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

async function runCleanup() {
  try {
    const deleted = await db.orders.deleteOlderThanMonthlyBuffer();
    if (deleted > 0) {
      sysLogs.addLog({
        method: "CRON",
        url: "/internal/finance-archive-cleanup",
        headers: {},
        status: 200,
        tenant_context: "ALL",
        auth_type: "System Cron",
        body: { deleted_orders: deleted, ran_at: new Date().toISOString() },
      });
    }
  } catch (err) {
    // Ошибка автоочистки не должна валить процесс — логируем и ждём следующего запуска.
    console.error("[scheduleMonthlyCleanup] Ошибка автоочистки заказов:", err);
    sysLogs.addLog({
      method: "CRON",
      url: "/internal/finance-archive-cleanup",
      headers: {},
      status: 500,
      tenant_context: "ALL",
      auth_type: "System Cron",
      body: { error: String(err) },
    });
  }
}

/**
 * Ежедневная автоочистка заказов старше 35-дневного буфера после конца месяца (Задача 12).
 * Запускается один раз при старте сервера, далее — каждый день в 04:00 UTC.
 * Буфер 35 дней даёт founder/manager время скачать архив прошлого месяца до удаления данных.
 */
export function scheduleMonthlyCleanup(): void {
  setTimeout(() => {
    runCleanup();
    setInterval(runCleanup, ONE_DAY_MS);
  }, msUntilNext4amUTC());
}
