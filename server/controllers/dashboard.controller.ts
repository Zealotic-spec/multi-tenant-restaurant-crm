// Контроллеры дашборда: читают данные из кэш-таблиц и управляют настройками ресторана/iiko.

import type { Response } from "express";
import { pool } from "../pgdb.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import type { SecureRequest } from "../middlewares/tenant.js";
import { syncRestaurant } from "../iiko/sync.js";
import { randomUUID } from "crypto";
import { generateMockFeedback } from "../iiko/mock.js";

// ─── Аналитика и Финансы ─────────────────────────────────────────────────────

export const getAnalytics = asyncHandler(async (req: SecureRequest, res: Response) => {
  const restaurantId = req.restaurant_id!;
  const { from, to } = req.query as { from?: string; to?: string };

  const dateFrom = from ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const dateTo = to ?? new Date().toISOString().split("T")[0];

  const result = await pool.query(
    `SELECT date, revenue, profit, avg_check, guests_count, orders_count, food_cost_pct,
            cash_amount, card_amount, sbp_amount, other_amount
     FROM analytics_cache
     WHERE restaurant_id = $1 AND date >= $2 AND date <= $3
     ORDER BY date ASC`,
    [restaurantId, dateFrom, dateTo]
  );

  // Суммарные метрики за период
  const rows = result.rows;
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
  const totalProfit = rows.reduce((s, r) => s + Number(r.profit), 0);
  const totalGuests = rows.reduce((s, r) => s + Number(r.guests_count), 0);
  const totalOrders = rows.reduce((s, r) => s + Number(r.orders_count), 0);
  const avgCheck = totalGuests > 0 ? totalRevenue / totalGuests : 0;
  const avgFoodCost = rows.length > 0
    ? rows.reduce((s, r) => s + Number(r.food_cost_pct), 0) / rows.length
    : 0;

  const paymentTotals = {
    cash: rows.reduce((s, r) => s + Number(r.cash_amount), 0),
    card: rows.reduce((s, r) => s + Number(r.card_amount), 0),
    sbp: rows.reduce((s, r) => s + Number(r.sbp_amount), 0),
    other: rows.reduce((s, r) => s + Number(r.other_amount), 0),
  };

  res.json({
    summary: {
      revenue: Math.round(totalRevenue),
      profit: Math.round(totalProfit),
      avg_check: Math.round(avgCheck),
      guests_count: totalGuests,
      orders_count: totalOrders,
      food_cost_pct: parseFloat(avgFoodCost.toFixed(1)),
    },
    payment_methods: paymentTotals,
    daily: rows.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue),
      profit: Number(r.profit),
      avg_check: Number(r.avg_check),
      guests_count: Number(r.guests_count),
      orders_count: Number(r.orders_count),
    })),
  });
});

// ─── Меню и Кухня ────────────────────────────────────────────────────────────

export const getMenuStats = asyncHandler(async (req: SecureRequest, res: Response) => {
  const restaurantId = req.restaurant_id!;
  const { from, to } = req.query as { from?: string; to?: string };

  const dateFrom = from ?? new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const dateTo = to ?? new Date().toISOString().split("T")[0];

  // Агрегируем по блюдам за период
  const result = await pool.query(
    `SELECT dish_name, category,
            SUM(orders_count)::int AS orders_count,
            SUM(revenue)::numeric AS revenue,
            ROUND(AVG(avg_cook_time)) AS avg_cook_time
     FROM menu_stats_cache
     WHERE restaurant_id = $1 AND date >= $2 AND date <= $3
     GROUP BY dish_name, category
     ORDER BY orders_count DESC`,
    [restaurantId, dateFrom, dateTo]
  );

  const all = result.rows;
  const top5 = all.slice(0, 5);
  const bottom5 = all.slice(-5).reverse();

  res.json({ top: top5, bottom: bottom5, all: all.slice(0, 20) });
});

export const getStopList = asyncHandler(async (req: SecureRequest, res: Response) => {
  const result = await pool.query(
    "SELECT items, synced_at FROM stop_list_cache WHERE restaurant_id = $1",
    [req.restaurant_id!]
  );
  const row = result.rows[0];
  res.json({ items: row?.items ?? [], synced_at: row?.synced_at ?? null });
});

// ─── Зал и Бронирование ───────────────────────────────────────────────────────

export const getHallStatus = asyncHandler(async (req: SecureRequest, res: Response) => {
  const result = await pool.query(
    "SELECT tables, synced_at FROM hall_status_cache WHERE restaurant_id = $1",
    [req.restaurant_id!]
  );
  const row = result.rows[0];
  res.json({ tables: row?.tables ?? [], synced_at: row?.synced_at ?? null });
});

// ─── Персонал и KPI ──────────────────────────────────────────────────────────

export const getStaffKpi = asyncHandler(async (req: SecureRequest, res: Response) => {
  const restaurantId = req.restaurant_id!;
  const { from, to } = req.query as { from?: string; to?: string };

  const dateFrom = from ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const dateTo = to ?? new Date().toISOString().split("T")[0];

  const result = await pool.query(
    `SELECT waiter_id, waiter_name,
            SUM(orders_count)::int AS orders_count,
            SUM(revenue)::numeric AS revenue,
            SUM(tips_amount)::numeric AS tips_amount,
            ROUND(AVG(avg_service_time)) AS avg_service_time
     FROM staff_kpi_cache
     WHERE restaurant_id = $1 AND date >= $2 AND date <= $3
     GROUP BY waiter_id, waiter_name
     ORDER BY revenue DESC`,
    [restaurantId, dateFrom, dateTo]
  );

  res.json({ staff: result.rows });
});

// ─── Маркетинг и Гости ───────────────────────────────────────────────────────

export const getPeakHours = asyncHandler(async (req: SecureRequest, res: Response) => {
  const restaurantId = req.restaurant_id!;
  const { from, to } = req.query as { from?: string; to?: string };

  const dateFrom = from ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const dateTo = to ?? new Date().toISOString().split("T")[0];

  const result = await pool.query(
    `SELECT hour,
            SUM(guests_count)::int AS guests_count,
            SUM(orders_count)::int AS orders_count
     FROM peak_hours_cache
     WHERE restaurant_id = $1 AND date >= $2 AND date <= $3
     GROUP BY hour
     ORDER BY hour ASC`,
    [restaurantId, dateFrom, dateTo]
  );

  res.json({ hours: result.rows });
});

export const getFeedback = asyncHandler(async (req: SecureRequest, res: Response) => {
  const offset = Math.max(0, Number((req.query as { offset?: string }).offset) || 0);

  const [listResult, statsResult] = await Promise.all([
    pool.query(
      `SELECT id, rating, comment, source, guest_name, created_at
       FROM guest_feedback
       WHERE restaurant_id = $1
       ORDER BY created_at DESC
       LIMIT 50 OFFSET $2`,
      [req.restaurant_id!, offset]
    ),
    pool.query(
      `SELECT COALESCE(AVG(rating), 0)::numeric AS avg_rating, COUNT(*)::int AS total
       FROM guest_feedback
       WHERE restaurant_id = $1`,
      [req.restaurant_id!]
    ),
  ]);

  res.json({
    feedback: listResult.rows,
    avg_rating: parseFloat(Number(statsResult.rows[0].avg_rating).toFixed(1)),
    total: statsResult.rows[0].total,
  });
});

// ─── Настройки ресторана и iiko ───────────────────────────────────────────────

export const getRestaurantSettings = asyncHandler(async (req: SecureRequest, res: Response) => {
  const result = await pool.query(
    "SELECT primary_color, logo_url, font_family, enabled_modules FROM restaurant_settings WHERE restaurant_id = $1",
    [req.restaurant_id!]
  );
  const defaults = {
    primary_color: "#6366F1",
    logo_url: null,
    font_family: "Inter",
    enabled_modules: ["analytics", "menu", "hall", "staff", "marketing", "reservations", "orders", "employees", "menu-editor"],
  };
  res.json(result.rows[0] ?? defaults);
});

export const updateRestaurantSettings = asyncHandler(async (req: SecureRequest, res: Response) => {
  const { primary_color, logo_url, font_family, enabled_modules } = req.body;
  await pool.query(
    `INSERT INTO restaurant_settings (restaurant_id, primary_color, logo_url, font_family, enabled_modules)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (restaurant_id) DO UPDATE SET
       primary_color = COALESCE($2, restaurant_settings.primary_color),
       logo_url = COALESCE($3, restaurant_settings.logo_url),
       font_family = COALESCE($4, restaurant_settings.font_family),
       enabled_modules = COALESCE($5, restaurant_settings.enabled_modules)`,
    [req.restaurant_id!, primary_color, logo_url, font_family, enabled_modules]
  );
  res.json({ message: "Настройки обновлены." });
});

export const getIikoStatus = asyncHandler(async (req: SecureRequest, res: Response) => {
  const result = await pool.query(
    "SELECT api_login, organization_ids, last_sync_at, pos_type FROM iiko_credentials WHERE restaurant_id = $1",
    [req.restaurant_id!]
  );
  const row = result.rows[0];
  res.json({
    connected: !!row?.api_login,
    api_login: row?.api_login ? `${row.api_login.slice(0, 4)}****` : null,
    organization_ids: row?.organization_ids ?? [],
    last_sync_at: row?.last_sync_at ?? null,
    pos_type: row?.pos_type ?? "iiko",
  });
});

export const saveIikoCredentials = asyncHandler(async (req: SecureRequest, res: Response) => {
  const { api_login, organization_ids } = req.body;
  if (!api_login) {
    res.status(400).json({ error: "api_login обязателен." });
    return;
  }
  await pool.query(
    `INSERT INTO iiko_credentials (restaurant_id, api_login, organization_ids)
     VALUES ($1, $2, $3)
     ON CONFLICT (restaurant_id) DO UPDATE SET
       api_login = $2,
       organization_ids = $3`,
    [req.restaurant_id!, api_login, organization_ids ?? []]
  );
  res.json({ message: "Учётные данные iiko сохранены." });
});

export const triggerManualSync = asyncHandler(async (req: SecureRequest, res: Response) => {
  const restaurantId = req.restaurant_id!;
  // Запускаем синк в фоне, не блокируем ответ
  syncRestaurant(restaurantId).catch((err) =>
    console.error(`[manual-sync] Failed for restaurant ${restaurantId}:`, err)
  );
  res.json({ message: "Синхронизация запущена." });
});

export const addGuestFeedback = asyncHandler(async (req: SecureRequest, res: Response) => {
  const { rating, comment, guest_name, source } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "rating должен быть от 1 до 5." });
    return;
  }
  await pool.query(
    `INSERT INTO guest_feedback (id, restaurant_id, rating, comment, guest_name, source)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), req.restaurant_id!, rating, comment, guest_name, source ?? "manual"]
  );
  res.status(201).json({ message: "Отзыв добавлен." });
});
