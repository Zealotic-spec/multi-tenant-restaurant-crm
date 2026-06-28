// Синхронизация данных из iiko → кэш-таблицы PostgreSQL.
// Основная функция: syncRestaurant(restaurantId) — вызывается CRON'ом каждые 15 минут.

import { pool } from "../pgdb.js";
import { randomUUID } from "crypto";
import {
  fetchAnalytics,
  fetchMenuStats,
  fetchStopList,
  fetchHallStatus,
  fetchStaffKpi,
  fetchPeakHours,
  generateMockFeedback,
  type IikoClientOptions,
} from "./client.js";

export async function syncRestaurant(restaurantId: string): Promise<void> {
  const credRow = await pool.query(
    "SELECT api_login, organization_ids FROM iiko_credentials WHERE restaurant_id = $1",
    [restaurantId]
  );

  const opts: IikoClientOptions = credRow.rows[0]
    ? {
        apiLogin: credRow.rows[0].api_login || null,
        organizationIds: credRow.rows[0].organization_ids ?? [],
        restaurantId,
      }
    : { apiLogin: null, organizationIds: [], restaurantId };

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  await Promise.allSettled([
    syncAnalytics(restaurantId, opts, thirtyDaysAgo, today),
    syncMenuStats(restaurantId, opts, thirtyDaysAgo, today),
    syncStopList(restaurantId, opts),
    syncHallStatus(restaurantId, opts),
    syncStaffKpi(restaurantId, opts, thirtyDaysAgo, today),
    syncPeakHours(restaurantId, opts, thirtyDaysAgo, today),
    syncFeedback(restaurantId, opts),
  ]);

  await pool.query(
    "UPDATE iiko_credentials SET last_sync_at = NOW() WHERE restaurant_id = $1",
    [restaurantId]
  );
}

// ─── Синки по разделам ────────────────────────────────────────────────────────

async function syncAnalytics(
  restaurantId: string,
  opts: IikoClientOptions,
  from: string,
  to: string
): Promise<void> {
  const rows = await fetchAnalytics(opts, from, to);
  for (const r of rows) {
    await pool.query(
      `INSERT INTO analytics_cache
         (id, restaurant_id, date, revenue, profit, avg_check, guests_count, orders_count,
          food_cost_pct, cash_amount, card_amount, sbp_amount, other_amount, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (restaurant_id, date) DO UPDATE SET
         revenue = EXCLUDED.revenue, profit = EXCLUDED.profit,
         avg_check = EXCLUDED.avg_check, guests_count = EXCLUDED.guests_count,
         orders_count = EXCLUDED.orders_count, food_cost_pct = EXCLUDED.food_cost_pct,
         cash_amount = EXCLUDED.cash_amount, card_amount = EXCLUDED.card_amount,
         sbp_amount = EXCLUDED.sbp_amount, other_amount = EXCLUDED.other_amount,
         synced_at = NOW()`,
      [
        randomUUID(), restaurantId, r.date, r.revenue, r.profit, r.avg_check,
        r.guests_count, r.orders_count, r.food_cost_pct,
        r.cash_amount, r.card_amount, r.sbp_amount, r.other_amount,
      ]
    );
  }
}

async function syncMenuStats(
  restaurantId: string,
  opts: IikoClientOptions,
  from: string,
  to: string
): Promise<void> {
  const rows = await fetchMenuStats(opts, from, to);
  // Удаляем старые данные за период и вставляем свежие
  await pool.query(
    "DELETE FROM menu_stats_cache WHERE restaurant_id = $1 AND date >= $2 AND date <= $3",
    [restaurantId, from, to]
  );
  for (const r of rows) {
    await pool.query(
      `INSERT INTO menu_stats_cache
         (id, restaurant_id, date, dish_name, category, orders_count, revenue, avg_cook_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), restaurantId, r.date, r.dish_name, r.category, r.orders_count, r.revenue, r.avg_cook_time]
    );
  }
}

async function syncStopList(restaurantId: string, opts: IikoClientOptions): Promise<void> {
  const items = await fetchStopList(opts);
  await pool.query(
    `INSERT INTO stop_list_cache (restaurant_id, items, synced_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (restaurant_id) DO UPDATE SET items = EXCLUDED.items, synced_at = NOW()`,
    [restaurantId, JSON.stringify(items)]
  );
}

async function syncHallStatus(restaurantId: string, opts: IikoClientOptions): Promise<void> {
  const tables = await fetchHallStatus(opts);
  await pool.query(
    `INSERT INTO hall_status_cache (restaurant_id, tables, synced_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (restaurant_id) DO UPDATE SET tables = EXCLUDED.tables, synced_at = NOW()`,
    [restaurantId, JSON.stringify(tables)]
  );
}

async function syncStaffKpi(
  restaurantId: string,
  opts: IikoClientOptions,
  from: string,
  to: string
): Promise<void> {
  const rows = await fetchStaffKpi(opts, from, to);
  for (const r of rows) {
    await pool.query(
      `INSERT INTO staff_kpi_cache
         (id, restaurant_id, date, waiter_name, waiter_id, orders_count, revenue, tips_amount, avg_service_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (restaurant_id, date, waiter_id) DO UPDATE SET
         orders_count = EXCLUDED.orders_count, revenue = EXCLUDED.revenue,
         tips_amount = EXCLUDED.tips_amount, avg_service_time = EXCLUDED.avg_service_time,
         synced_at = NOW()`,
      [randomUUID(), restaurantId, r.date, r.waiter_name, r.waiter_id,
       r.orders_count, r.revenue, r.tips_amount, r.avg_service_time]
    );
  }
}

async function syncPeakHours(
  restaurantId: string,
  opts: IikoClientOptions,
  from: string,
  to: string
): Promise<void> {
  const rows = await fetchPeakHours(opts, from, to);
  for (const r of rows) {
    await pool.query(
      `INSERT INTO peak_hours_cache (id, restaurant_id, date, hour, guests_count, orders_count)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (restaurant_id, date, hour) DO UPDATE SET
         guests_count = EXCLUDED.guests_count, orders_count = EXCLUDED.orders_count,
         synced_at = NOW()`,
      [randomUUID(), restaurantId, r.date, r.hour, r.guests_count, r.orders_count]
    );
  }
}

async function syncFeedback(restaurantId: string, _opts: IikoClientOptions): Promise<void> {
  // Проверяем, есть ли уже отзывы — если нет, засеваем mock-данные единожды.
  const existing = await pool.query(
    "SELECT COUNT(*) AS cnt FROM guest_feedback WHERE restaurant_id = $1",
    [restaurantId]
  );
  if (Number(existing.rows[0]?.cnt ?? 0) > 0) return;

  const items = generateMockFeedback();
  for (const item of items) {
    await pool.query(
      `INSERT INTO guest_feedback (id, restaurant_id, rating, comment, source, guest_name, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), restaurantId, item.rating, item.comment, item.source, item.guest_name, item.created_at]
    );
  }
}

// Инициализация начального синка для ресторана без учётных данных iiko
// (запускается при первом запуске чтобы дашборд не был пустым).
export async function initMockSyncIfNeeded(restaurantId: string): Promise<void> {
  const existing = await pool.query(
    "SELECT COUNT(*) AS cnt FROM analytics_cache WHERE restaurant_id = $1",
    [restaurantId]
  );
  if (Number(existing.rows[0]?.cnt ?? 0) > 0) return;

  console.log(`[iiko-sync] Initializing mock data for restaurant ${restaurantId}`);
  await syncRestaurant(restaurantId);
}
