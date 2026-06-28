import fs from "fs";
import path from "path";
import { randomUUID, randomBytes } from "crypto";
import { hashPassword } from "./utils/password";
import { pool } from "./pgdb";

// ─── Domain types (формат не менялся, чтобы не ломать контроллеры/фронтенд) ───

// founder — основатель, может владеть несколькими ресторанами и видит всё (включая финансы);
// manager — управляющий, видит и делает всё, что founder, но строго в рамках одного ресторана;
// hostess — только бронирования; chef — только заказы/кухня.
export type Role = "super_admin" | "founder" | "manager" | "hostess" | "chef";

export interface Restaurant {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
  founder_id: string | null; // владелец (роль founder), управляющий этим рестораном
  archived_at: string | null; // soft-delete: ресторан скрыт, данные сохраняются
}

export interface FounderInviteCode {
  code: string;
  created_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
  note: string | null;
}

export interface User {
  id: string;
  restaurant_id: string;
  email: string;
  password_hash: string;
  role: Role;
}

export interface DiningTable {
  id: string;
  restaurant_id: string;
  table_number: number;
  capacity: number;
  x_pos: number;
  y_pos: number;
  current_status: "free" | "reserved" | "occupied";
}

export interface Reservation {
  id: string;
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null; // необязательный e-mail гостя — для email-уведомлений (миграция 004)
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  guests_count: number;
  table_id: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  created_at: string;
  reminder_sent?: boolean; // флаг идемпотентности cron-напоминаний (миграция 004)
}

export interface Order {
  id: string;
  restaurant_id: string;
  table_id?: string; // Обязателен при delivery_type = "in_restaurant"
  // Курьерская доставка ("delivery") полностью удалена из системы — см. Задачу 6.
  delivery_type: "in_restaurant" | "takeaway";
  delivery_address?: string; // Больше не заполняется новыми заказами; поле сохранено для старых записей
  customer_name?: string;
  customer_phone?: string;
  total_amount: number;
  payment_status: "pending" | "paid" | "failed";
  order_status: "new" | "cooking" | "ready" | "delivered";
  created_at: string;
  sla_minutes: number;
  archived_month?: string | null; // 'YYYY-MM' — резерв для финансового архива (Задача 12)
}

export interface OrderItem {
  id: string;
  order_id: string;
  dish_name: string;
  quantity: number;
  price_per_unit: number;
}

export interface PaymentTransaction {
  id: string;
  transaction_key: string; // idempotency key to prevent double-charging
  order_id: string;
  amount: number;
  status: "success" | "failed";
  created_at: string;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  name: string;
  price: number;
  category?: string;
  is_available: boolean;
  image_url?: string;
  description?: string;
  badge_label?: string;
  badge_color?: "emerald" | "amber" | "red" | "indigo" | "purple";
}

// ─── Bootstrap: применяем SQL-миграцию и засеваем демо-данные (идемпотентно) ───
// Вызывается один раз из server.ts ДО старта HTTP-сервера (await initDatabase()).
// Не используем top-level await здесь специально: esbuild не умеет собирать
// top-level await в формате "cjs" (см. package.json → build), а server.ts остаётся
// единственным местом, которое явно дожидается готовности базы.

let initPromise: Promise<void> | null = null;

export function initDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const migration001 = fs.readFileSync(
        path.join(process.cwd(), "server", "migrations", "001_init.sql"), "utf-8"
      );
      await pool.query(migration001);

      const migration002 = fs.readFileSync(
        path.join(process.cwd(), "server", "migrations", "002_dashboard.sql"), "utf-8"
      );
      await pool.query(migration002);

      const migration003 = fs.readFileSync(
        path.join(process.cwd(), "server", "migrations", "003_constraints.sql"), "utf-8"
      );
      await pool.query(migration003);

      const migration004 = fs.readFileSync(
        path.join(process.cwd(), "server", "migrations", "004_notifications.sql"), "utf-8"
      );
      await pool.query(migration004);

      if (await isEmpty()) {
        await seed();
      }
    })();
  }
  return initPromise;
}

// ─── Преобразование строк pg → доменные типы (TIMESTAMPTZ приходит как Date, не string) ───

function toISO(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value as string;
}

function toISOOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toISO(value);
}

function rowToRestaurant(row: any): Restaurant {
  return {
    id: row.id,
    name: row.name,
    api_key: row.api_key,
    created_at: toISO(row.created_at),
    founder_id: row.founder_id ?? null,
    archived_at: toISOOrNull(row.archived_at),
  };
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    email: row.email,
    password_hash: row.password_hash,
    role: row.role,
  };
}

function rowToTable(row: any): DiningTable {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    table_number: row.table_number,
    capacity: row.capacity,
    x_pos: Number(row.x_pos),
    y_pos: Number(row.y_pos),
    current_status: row.current_status,
  };
}

function rowToReservation(row: any): Reservation {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_email: row.customer_email ?? null,
    date: row.date,
    time: row.time,
    guests_count: row.guests_count,
    table_id: row.table_id,
    status: row.status,
    created_at: toISO(row.created_at),
    reminder_sent: row.reminder_sent ?? false,
  };
}

function rowToOrder(row: any): Order {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    table_id: row.table_id ?? undefined,
    delivery_type: row.delivery_type,
    delivery_address: row.delivery_address ?? undefined,
    customer_name: row.customer_name ?? undefined,
    customer_phone: row.customer_phone ?? undefined,
    total_amount: Number(row.total_amount),
    payment_status: row.payment_status,
    order_status: row.order_status,
    created_at: toISO(row.created_at),
    sla_minutes: row.sla_minutes,
    archived_month: row.archived_month ?? null,
  };
}

function rowToOrderItem(row: any): OrderItem {
  return {
    id: row.id,
    order_id: row.order_id,
    dish_name: row.dish_name,
    quantity: row.quantity,
    price_per_unit: Number(row.price_per_unit),
  };
}

function rowToPaymentTransaction(row: any): PaymentTransaction {
  return {
    id: row.id,
    transaction_key: row.transaction_key,
    order_id: row.order_id,
    amount: Number(row.amount),
    status: row.status,
    created_at: toISO(row.created_at),
  };
}

function rowToMenuItem(row: any): MenuItem {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    name: row.name,
    price: Number(row.price),
    category: row.category ?? undefined,
    is_available: row.is_available === true,
    image_url: row.image_url ?? undefined,
    description: row.description ?? undefined,
    badge_label: row.badge_label ?? undefined,
    badge_color: row.badge_color ?? undefined,
  };
}

function rowToInvite(row: any): FounderInviteCode {
  return {
    code: row.code,
    created_at: toISO(row.created_at),
    used_at: toISOOrNull(row.used_at),
    used_by_user_id: row.used_by_user_id ?? null,
    note: row.note ?? null,
  };
}

// ─── Repositories ───
// Любая выборка/изменение, привязанная к конкретному ресторану, фильтруется по
// restaurant_id строго через параметризованный placeholder ($1, $2, ...) — никогда
// через конкатенацию строк. Это центральное правило мультитенантной изоляции проекта.

const restaurants = {
  async findAll(): Promise<Restaurant[]> {
    const { rows } = await pool.query("SELECT * FROM restaurants ORDER BY created_at ASC");
    return rows.map(rowToRestaurant);
  },
  async findAllPublic(): Promise<{ id: string; name: string }[]> {
    const { rows } = await pool.query("SELECT id, name FROM restaurants WHERE archived_at IS NULL ORDER BY created_at ASC");
    return rows.map((r: any) => ({ id: r.id, name: r.name }));
  },
  async findById(id: string): Promise<Restaurant | undefined> {
    const { rows } = await pool.query("SELECT * FROM restaurants WHERE id = $1", [id]);
    return rows[0] ? rowToRestaurant(rows[0]) : undefined;
  },
  async findByApiKey(apiKey: string): Promise<Restaurant | undefined> {
    const { rows } = await pool.query("SELECT * FROM restaurants WHERE api_key = $1", [apiKey]);
    return rows[0] ? rowToRestaurant(rows[0]) : undefined;
  },
  /** Все рестораны конкретного founder'а (мультиресторанное владение). По умолчанию без архивных. */
  async findByFounder(founderId: string, opts?: { includeArchived?: boolean }): Promise<Restaurant[]> {
    if (opts?.includeArchived) {
      const { rows } = await pool.query(
        "SELECT * FROM restaurants WHERE founder_id = $1 ORDER BY created_at ASC",
        [founderId]
      );
      return rows.map(rowToRestaurant);
    }
    const { rows } = await pool.query(
      "SELECT * FROM restaurants WHERE founder_id = $1 AND archived_at IS NULL ORDER BY created_at ASC",
      [founderId]
    );
    return rows.map(rowToRestaurant);
  },
  async create(data: { name: string; api_key: string; id?: string; founder_id?: string | null }): Promise<Restaurant> {
    const restaurant: Restaurant = {
      id: data.id || `rest_${randomUUID()}`,
      name: data.name,
      api_key: data.api_key,
      created_at: new Date().toISOString(),
      founder_id: data.founder_id ?? null,
      archived_at: null,
    };
    await pool.query(
      "INSERT INTO restaurants (id, name, api_key, created_at, founder_id, archived_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [restaurant.id, restaurant.name, restaurant.api_key, restaurant.created_at, restaurant.founder_id, null]
    );
    return restaurant;
  },
  /** Soft-delete: ресторан помечается архивным, но строки в БД не удаляются. */
  async archive(id: string, founderId: string): Promise<Restaurant | undefined> {
    const existing = await restaurants.findById(id);
    if (!existing || existing.founder_id !== founderId || existing.archived_at) return undefined;
    const archived_at = new Date().toISOString();
    await pool.query("UPDATE restaurants SET archived_at = $1 WHERE id = $2", [archived_at, id]);
    return { ...existing, archived_at };
  },
};

const users = {
  async findByEmail(email: string): Promise<User | undefined> {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    return rows[0] ? rowToUser(rows[0]) : undefined;
  },
  async findById(id: string): Promise<User | undefined> {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0] ? rowToUser(rows[0]) : undefined;
  },
  async findByRestaurant(restaurantId: string): Promise<User[]> {
    const { rows } = await pool.query("SELECT * FROM users WHERE restaurant_id = $1", [restaurantId]);
    return rows.map(rowToUser);
  },
  async findByIdAndRestaurant(id: string, restaurantId: string): Promise<User | undefined> {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1 AND restaurant_id = $2", [id, restaurantId]);
    return rows[0] ? rowToUser(rows[0]) : undefined;
  },
  async findAllRedacted(): Promise<Omit<User, "password_hash">[]> {
    const { rows } = await pool.query("SELECT id, restaurant_id, email, role FROM users ORDER BY restaurant_id ASC");
    return rows;
  },
  async create(data: { restaurant_id: string; email: string; password_hash: string; role: Role; id?: string }): Promise<User> {
    const user: User = {
      id: data.id || `usr_${randomUUID()}`,
      restaurant_id: data.restaurant_id,
      email: data.email.toLowerCase(),
      password_hash: data.password_hash,
      role: data.role,
    };
    await pool.query(
      "INSERT INTO users (id, restaurant_id, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
      [user.id, user.restaurant_id, user.email, user.password_hash, user.role]
    );
    return user;
  },
  /** Увольнение сотрудника — строго в пределах своего ресторана (restaurant_id из JWT founder/manager). */
  async delete(id: string, restaurantId: string): Promise<User | undefined> {
    const existing = await users.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    await pool.query("DELETE FROM users WHERE id = $1 AND restaurant_id = $2", [id, restaurantId]);
    return existing;
  },
  /** Сброс пароля сотрудника (например, если он забыл свой). Хэш уже посчитан вызывающей стороной. */
  async resetPassword(id: string, restaurantId: string, newPasswordHash: string): Promise<User | undefined> {
    const existing = await users.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2 AND restaurant_id = $3",
      [newPasswordHash, id, restaurantId]
    );
    return { ...existing, password_hash: newPasswordHash };
  },
};

const tables = {
  async findByRestaurant(restaurantId: string): Promise<DiningTable[]> {
    const { rows } = await pool.query(
      "SELECT * FROM dining_tables WHERE restaurant_id = $1 ORDER BY table_number ASC",
      [restaurantId]
    );
    return rows.map(rowToTable);
  },
  async findByIdAndRestaurant(id: string, restaurantId: string): Promise<DiningTable | undefined> {
    const { rows } = await pool.query(
      "SELECT * FROM dining_tables WHERE id = $1 AND restaurant_id = $2",
      [id, restaurantId]
    );
    return rows[0] ? rowToTable(rows[0]) : undefined;
  },
  async findByRestaurantAndNumber(restaurantId: string, tableNumber: number): Promise<DiningTable | undefined> {
    const { rows } = await pool.query(
      "SELECT * FROM dining_tables WHERE restaurant_id = $1 AND table_number = $2",
      [restaurantId, tableNumber]
    );
    return rows[0] ? rowToTable(rows[0]) : undefined;
  },
  async create(data: Omit<DiningTable, "id"> & { id?: string }): Promise<DiningTable> {
    const table: DiningTable = { id: data.id || `tbl_${randomUUID()}`, ...data };
    await pool.query(
      `INSERT INTO dining_tables (id, restaurant_id, table_number, capacity, x_pos, y_pos, current_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [table.id, table.restaurant_id, table.table_number, table.capacity, table.x_pos, table.y_pos, table.current_status]
    );
    return table;
  },
  async update(id: string, restaurantId: string, patch: Partial<DiningTable>): Promise<DiningTable | undefined> {
    const existing = await tables.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    const merged: DiningTable = { ...existing, ...patch, id: existing.id, restaurant_id: existing.restaurant_id };
    await pool.query(
      `UPDATE dining_tables SET capacity = $1, x_pos = $2, y_pos = $3, current_status = $4
       WHERE id = $5 AND restaurant_id = $6`,
      [merged.capacity, merged.x_pos, merged.y_pos, merged.current_status, id, restaurantId]
    );
    return merged;
  },
  async setStatus(id: string, restaurantId: string, status: DiningTable["current_status"]): Promise<void> {
    await pool.query("UPDATE dining_tables SET current_status = $1 WHERE id = $2 AND restaurant_id = $3", [status, id, restaurantId]);
  },
  async delete(id: string, restaurantId: string): Promise<DiningTable | undefined> {
    const existing = await tables.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    await pool.query("DELETE FROM dining_tables WHERE id = $1 AND restaurant_id = $2", [id, restaurantId]);
    return existing;
  },
};

const reservations = {
  async findByRestaurant(restaurantId: string, opts?: { limit?: number; offset?: number }): Promise<Reservation[]> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const { rows } = await pool.query(
      "SELECT * FROM reservations WHERE restaurant_id = $1 ORDER BY date DESC, time DESC LIMIT $2 OFFSET $3",
      [restaurantId, limit, offset]
    );
    return rows.map(rowToReservation);
  },
  async countByRestaurant(restaurantId: string): Promise<number> {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM reservations WHERE restaurant_id = $1",
      [restaurantId]
    );
    return rows[0].total;
  },
  async findByTableAndDate(tableId: string, date: string): Promise<Reservation[]> {
    const { rows } = await pool.query(
      "SELECT * FROM reservations WHERE table_id = $1 AND date = $2",
      [tableId, date]
    );
    return rows.map(rowToReservation);
  },
  /** Все рестораны конкретного ресторана сразу на несколько дат (используется для карты доступности столов, Задача 4). */
  async findByRestaurantAndDate(restaurantId: string, date: string): Promise<Reservation[]> {
    const { rows } = await pool.query(
      "SELECT * FROM reservations WHERE restaurant_id = $1 AND date = $2 AND status != 'cancelled'",
      [restaurantId, date]
    );
    return rows.map(rowToReservation);
  },
  async findByIdAndRestaurant(id: string, restaurantId: string): Promise<Reservation | undefined> {
    const { rows } = await pool.query(
      "SELECT * FROM reservations WHERE id = $1 AND restaurant_id = $2",
      [id, restaurantId]
    );
    return rows[0] ? rowToReservation(rows[0]) : undefined;
  },
  async create(data: Omit<Reservation, "id" | "created_at"> & { id?: string }): Promise<Reservation> {
    const reservation: Reservation = {
      id: data.id || `res_${randomUUID()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    await pool.query(
      `INSERT INTO reservations
        (id, restaurant_id, customer_name, customer_phone, customer_email, date, time, guests_count, table_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        reservation.id,
        reservation.restaurant_id,
        reservation.customer_name,
        reservation.customer_phone,
        reservation.customer_email ?? null,
        reservation.date,
        reservation.time,
        reservation.guests_count,
        reservation.table_id,
        reservation.status,
        reservation.created_at,
      ]
    );
    return reservation;
  },
  async updateStatus(id: string, restaurantId: string, status: Reservation["status"]): Promise<Reservation | undefined> {
    const existing = await reservations.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    await pool.query(
      "UPDATE reservations SET status = $1 WHERE id = $2 AND restaurant_id = $3",
      [status, id, restaurantId]
    );
    return { ...existing, status };
  },
  /** Есть ли активная (будущая, не отменённая/завершённая) бронь — блокирует архивацию ресторана. */
  async hasFutureActiveByRestaurant(restaurantId: string): Promise<boolean> {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const { rows } = await pool.query(
      `SELECT 1 FROM reservations
       WHERE restaurant_id = $1
         AND status IN ('pending', 'confirmed')
         AND (date > $2 OR (date = $2 AND time >= $3))
       LIMIT 1`,
      [restaurantId, todayStr, timeStr]
    );
    return rows.length > 0;
  },
};

const orders = {
  async findByRestaurant(restaurantId: string, opts?: { paymentStatus?: Order["payment_status"] }): Promise<Order[]> {
    if (opts?.paymentStatus) {
      const { rows } = await pool.query(
        "SELECT * FROM orders WHERE restaurant_id = $1 AND payment_status = $2 ORDER BY created_at DESC",
        [restaurantId, opts.paymentStatus]
      );
      return rows.map(rowToOrder);
    }
    const { rows } = await pool.query(
      "SELECT * FROM orders WHERE restaurant_id = $1 ORDER BY created_at DESC",
      [restaurantId]
    );
    return rows.map(rowToOrder);
  },
  async findById(id: string): Promise<Order | undefined> {
    const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
    return rows[0] ? rowToOrder(rows[0]) : undefined;
  },
  async findByIdAndRestaurant(id: string, restaurantId: string): Promise<Order | undefined> {
    const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2", [id, restaurantId]);
    return rows[0] ? rowToOrder(rows[0]) : undefined;
  },
  async create(data: Omit<Order, "id" | "created_at"> & { id?: string }): Promise<Order> {
    const order: Order = {
      id: data.id || `ord_${randomUUID()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    await pool.query(
      `INSERT INTO orders
        (id, restaurant_id, table_id, delivery_type, delivery_address, customer_name, customer_phone, total_amount, payment_status, order_status, created_at, sla_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        order.id,
        order.restaurant_id,
        order.table_id ?? null,
        order.delivery_type,
        order.delivery_address ?? null,
        order.customer_name ?? null,
        order.customer_phone ?? null,
        order.total_amount,
        order.payment_status,
        order.order_status,
        order.created_at,
        order.sla_minutes,
      ]
    );
    return order;
  },
  async updatePaymentStatus(id: string, payment_status: Order["payment_status"], order_status?: Order["order_status"]): Promise<void> {
    if (order_status) {
      await pool.query(
        "UPDATE orders SET payment_status = $1, order_status = $2 WHERE id = $3",
        [payment_status, order_status, id]
      );
    } else {
      await pool.query("UPDATE orders SET payment_status = $1 WHERE id = $2", [payment_status, id]);
    }
  },
  async updateOrderStatus(id: string, restaurantId: string, order_status: Order["order_status"]): Promise<Order | undefined> {
    const existing = await orders.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    await pool.query(
      "UPDATE orders SET order_status = $1 WHERE id = $2 AND restaurant_id = $3",
      [order_status, id, restaurantId]
    );
    return { ...existing, order_status };
  },
  /** Есть ли незавершённый заказ (не "delivered") — блокирует архивацию ресторана. */
  async hasActiveByRestaurant(restaurantId: string): Promise<boolean> {
    const { rows } = await pool.query(
      "SELECT 1 FROM orders WHERE restaurant_id = $1 AND order_status != 'delivered' LIMIT 1",
      [restaurantId]
    );
    return rows.length > 0;
  },
  /** Список месяцев (YYYY-MM), за которые в этом ресторане есть заказы, с агрегатами для финансового архива (Задача 12). */
  async findMonthsSummary(restaurantId: string): Promise<{ month: string; order_count: number; total_revenue: number }[]> {
    const { rows } = await pool.query(
      `SELECT TO_CHAR(created_at, 'YYYY-MM') AS month,
              COUNT(*)::int AS order_count,
              COALESCE(SUM(total_amount), 0) AS total_revenue
       FROM orders
       WHERE restaurant_id = $1
       GROUP BY month
       ORDER BY month DESC`,
      [restaurantId]
    );
    return rows.map((r: any) => ({ month: r.month, order_count: r.order_count, total_revenue: Number(r.total_revenue) }));
  },
  /** Заказы строго за указанный месяц (YYYY-MM) этого ресторана — для экспорта архива (Задача 12). */
  async findByRestaurantAndMonth(restaurantId: string, month: string): Promise<Order[]> {
    const { rows } = await pool.query(
      `SELECT * FROM orders
       WHERE restaurant_id = $1 AND TO_CHAR(created_at, 'YYYY-MM') = $2
       ORDER BY created_at ASC`,
      [restaurantId, month]
    );
    return rows.map(rowToOrder);
  },
  /**
   * Удаляет заказы старше 35-дневного буфера после конца месяца (Задача 12).
   * Граница вычисляется самим Postgres'ом (DATE_TRUNC + INTERVAL) — буквально по формуле
   * из спецификации, без риска ошибиться в часовых поясах при пересчёте даты в JS.
   * order_items удаляются каскадно (ON DELETE CASCADE).
   */
  async deleteOlderThanMonthlyBuffer(): Promise<number> {
    const result = await pool.query(
      "DELETE FROM orders WHERE created_at < DATE_TRUNC('month', NOW()) - INTERVAL '35 days'"
    );
    return result.rowCount ?? 0;
  },
};

const orderItems = {
  async findByOrder(orderId: string): Promise<OrderItem[]> {
    const { rows } = await pool.query("SELECT * FROM order_items WHERE order_id = $1", [orderId]);
    return rows.map(rowToOrderItem);
  },
  /** Один JOIN вместо N+1 запросов — возвращает заказы с вложенными items. */
  async findByRestaurantWithItems(
    restaurantId: string,
    opts?: { paymentStatus?: Order["payment_status"]; month?: string; limit?: number; offset?: number }
  ): Promise<(Order & { items: OrderItem[] })[]> {
    const conditions: string[] = ["o.restaurant_id = $1"];
    const params: unknown[] = [restaurantId];
    let idx = 2;

    if (opts?.paymentStatus) {
      conditions.push(`o.payment_status = $${idx++}`);
      params.push(opts.paymentStatus);
    }
    if (opts?.month) {
      conditions.push(`TO_CHAR(o.created_at, 'YYYY-MM') = $${idx++}`);
      params.push(opts.month);
    }

    const where = conditions.join(" AND ");
    const limitClause = opts?.limit ? `LIMIT $${idx++}` : "";
    if (opts?.limit) params.push(opts.limit);
    const offsetClause = opts?.offset ? `OFFSET $${idx++}` : "";
    if (opts?.offset) params.push(opts.offset);

    const { rows } = await pool.query(
      `SELECT o.id AS o_id, o.restaurant_id, o.table_id, o.delivery_type, o.delivery_address,
              o.customer_name, o.customer_phone, o.total_amount, o.payment_status, o.order_status,
              o.created_at, o.sla_minutes, o.archived_month,
              oi.id AS item_id, oi.dish_name, oi.quantity, oi.price_per_unit
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE ${where}
       ORDER BY o.created_at DESC ${limitClause} ${offsetClause}`,
      params
    );

    const orderMap = new Map<string, Order & { items: OrderItem[] }>();
    for (const row of rows) {
      if (!orderMap.has(row.o_id)) {
        orderMap.set(row.o_id, {
          id: row.o_id,
          restaurant_id: row.restaurant_id,
          table_id: row.table_id ?? undefined,
          delivery_type: row.delivery_type,
          delivery_address: row.delivery_address ?? undefined,
          customer_name: row.customer_name ?? undefined,
          customer_phone: row.customer_phone ?? undefined,
          total_amount: Number(row.total_amount),
          payment_status: row.payment_status,
          order_status: row.order_status,
          created_at: toISO(row.created_at),
          sla_minutes: row.sla_minutes,
          archived_month: row.archived_month ?? null,
          items: [],
        });
      }
      if (row.item_id) {
        orderMap.get(row.o_id)!.items.push({
          id: row.item_id,
          order_id: row.o_id,
          dish_name: row.dish_name,
          quantity: row.quantity,
          price_per_unit: Number(row.price_per_unit),
        });
      }
    }
    return [...orderMap.values()];
  },
  async create(data: Omit<OrderItem, "id"> & { id?: string }): Promise<OrderItem> {
    const item: OrderItem = { id: data.id || `itm_${randomUUID()}`, ...data };
    await pool.query(
      "INSERT INTO order_items (id, order_id, dish_name, quantity, price_per_unit) VALUES ($1, $2, $3, $4, $5)",
      [item.id, item.order_id, item.dish_name, item.quantity, item.price_per_unit]
    );
    return item;
  },
};

const paymentTransactions = {
  async findByKey(transactionKey: string): Promise<PaymentTransaction | undefined> {
    const { rows } = await pool.query(
      "SELECT * FROM payment_transactions WHERE transaction_key = $1",
      [transactionKey]
    );
    return rows[0] ? rowToPaymentTransaction(rows[0]) : undefined;
  },
  async create(data: Omit<PaymentTransaction, "id" | "created_at"> & { id?: string }): Promise<PaymentTransaction> {
    const tx: PaymentTransaction = {
      id: data.id || `txn_${randomUUID()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    await pool.query(
      "INSERT INTO payment_transactions (id, transaction_key, order_id, amount, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [tx.id, tx.transaction_key, tx.order_id, tx.amount, tx.status, tx.created_at]
    );
    return tx;
  },
  /** Idempotent insert: при конфликте по transaction_key ничего не делает и возвращает null. */
  async createIdempotent(data: Omit<PaymentTransaction, "id" | "created_at"> & { id?: string }): Promise<PaymentTransaction | null> {
    const tx: PaymentTransaction = {
      id: data.id || `txn_${randomUUID()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    const result = await pool.query(
      `INSERT INTO payment_transactions (id, transaction_key, order_id, amount, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (transaction_key) DO NOTHING
       RETURNING *`,
      [tx.id, tx.transaction_key, tx.order_id, tx.amount, tx.status, tx.created_at]
    );
    return result.rows[0] ? rowToPaymentTransaction(result.rows[0]) : null;
  },
};

const menuItems = {
  async findByRestaurant(restaurantId: string): Promise<MenuItem[]> {
    const { rows } = await pool.query(
      "SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY category ASC, name ASC",
      [restaurantId]
    );
    return rows.map(rowToMenuItem);
  },
  async findByIdAndRestaurant(id: string, restaurantId: string): Promise<MenuItem | undefined> {
    const { rows } = await pool.query(
      "SELECT * FROM menu_items WHERE id = $1 AND restaurant_id = $2",
      [id, restaurantId]
    );
    return rows[0] ? rowToMenuItem(rows[0]) : undefined;
  },
  async create(data: {
    restaurant_id: string;
    name: string;
    price: number;
    category?: string;
    is_available?: boolean;
    image_url?: string;
    description?: string;
    badge_label?: string;
    badge_color?: MenuItem["badge_color"];
    id?: string;
  }): Promise<MenuItem> {
    const item: MenuItem = {
      id: data.id || `menu_${randomUUID()}`,
      restaurant_id: data.restaurant_id,
      name: data.name,
      price: data.price,
      category: data.category,
      is_available: data.is_available ?? true,
      image_url: data.image_url,
      description: data.description,
      badge_label: data.badge_label,
      badge_color: data.badge_color,
    };
    await pool.query(
      `INSERT INTO menu_items (id, restaurant_id, name, price, category, is_available, image_url, description, badge_label, badge_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        item.id,
        item.restaurant_id,
        item.name,
        item.price,
        item.category ?? null,
        item.is_available,
        item.image_url ?? null,
        item.description ?? null,
        item.badge_label ?? null,
        item.badge_color ?? null,
      ]
    );
    return item;
  },
  async update(id: string, restaurantId: string, patch: Partial<Omit<MenuItem, "id" | "restaurant_id">>): Promise<MenuItem | undefined> {
    const existing = await menuItems.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    const merged: MenuItem = { ...existing, ...patch };
    await pool.query(
      `UPDATE menu_items SET name = $1, price = $2, category = $3, is_available = $4, image_url = $5, description = $6, badge_label = $7, badge_color = $8
       WHERE id = $9 AND restaurant_id = $10`,
      [
        merged.name,
        merged.price,
        merged.category ?? null,
        merged.is_available,
        merged.image_url ?? null,
        merged.description ?? null,
        merged.badge_label ?? null,
        merged.badge_color ?? null,
        id,
        restaurantId,
      ]
    );
    return merged;
  },
  async delete(id: string, restaurantId: string): Promise<MenuItem | undefined> {
    const existing = await menuItems.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    await pool.query("DELETE FROM menu_items WHERE id = $1 AND restaurant_id = $2", [id, restaurantId]);
    return existing;
  },
};

// Одноразовые коды-приглашения для регистрации founder-аккаунтов: защита от того, чтобы
// CRM мог бесплатно подключить кто угодно — код выдаёт лично super_admin каждому клиенту.
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов (0/O, 1/I)
  const bytes = randomBytes(12);
  let code = "";
  let byteIdx = 0;
  for (let group = 0; group < 3; group++) {
    if (group > 0) code += "-";
    for (let i = 0; i < 4; i++) code += chars[bytes[byteIdx++] % chars.length];
  }
  return code;
}

const inviteCodes = {
  async findAll(): Promise<FounderInviteCode[]> {
    const { rows } = await pool.query("SELECT * FROM invite_codes ORDER BY created_at DESC");
    return rows.map(rowToInvite);
  },
  async findByCode(code: string): Promise<FounderInviteCode | undefined> {
    const { rows } = await pool.query("SELECT * FROM invite_codes WHERE code = $1", [code.trim().toUpperCase()]);
    return rows[0] ? rowToInvite(rows[0]) : undefined;
  },
  async create(data?: { note?: string; code?: string }): Promise<FounderInviteCode> {
    let code = data?.code ? data.code.trim().toUpperCase() : generateInviteCode();
    while (await inviteCodes.findByCode(code)) code = generateInviteCode(); // защита от редкой коллизии (и от занятого фикс-кода)
    const invite: FounderInviteCode = {
      code,
      created_at: new Date().toISOString(),
      used_at: null,
      used_by_user_id: null,
      note: data?.note ?? null,
    };
    await pool.query(
      "INSERT INTO invite_codes (code, created_at, used_at, used_by_user_id, note) VALUES ($1, $2, $3, $4, $5)",
      [invite.code, invite.created_at, null, null, invite.note]
    );
    return invite;
  },
  async markUsed(code: string, usedByUserId: string): Promise<void> {
    await pool.query(
      "UPDATE invite_codes SET used_at = $1, used_by_user_id = $2 WHERE code = $3",
      [new Date().toISOString(), usedByUserId, code.trim().toUpperCase()]
    );
  },
};

// ─── Сервисные операции: diagnostics dump (только для super_admin) и reset/seed ───

async function isEmpty(): Promise<boolean> {
  const { rows } = await pool.query("SELECT COUNT(*) as count FROM restaurants");
  return Number(rows[0].count) === 0;
}

async function systemDump() {
  const [allRestaurants, allUsers, tablesRows, reservationsRows, ordersRows, orderItemsRows, menuItemsRows, invites] =
    await Promise.all([
      restaurants.findAll(),
      users.findAllRedacted(),
      pool.query("SELECT * FROM dining_tables"),
      pool.query("SELECT * FROM reservations"),
      pool.query("SELECT * FROM orders"),
      pool.query("SELECT * FROM order_items"),
      pool.query("SELECT * FROM menu_items"),
      inviteCodes.findAll(),
    ]);
  return {
    restaurants: allRestaurants,
    users: allUsers,
    tables: tablesRows.rows,
    reservations: reservationsRows.rows,
    orders: ordersRows.rows,
    orderItems: orderItemsRows.rows,
    menuItems: menuItemsRows.rows,
    inviteCodes: invites,
  };
}

async function wipeAll(): Promise<void> {
  await pool.query(`
    DELETE FROM payment_transactions;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM reservations;
    DELETE FROM menu_items;
    DELETE FROM dining_tables;
    DELETE FROM users;
    DELETE FROM restaurants;
    DELETE FROM invite_codes;
  `);
}

/** Демо-сид: 3 тестовых тенанта с захэшированными паролями (использовать только для разработки/демо). */
async function seed(): Promise<void> {
  await wipeAll();

  // Фиксированные id founder-пользователей нужны заранее: founder_id ресторана
  // указывает на них, а сами строки users создаются чуть ниже.
  const tenantA = await restaurants.create({
    id: "rest_tenant_a",
    name: "[Ресторан A]",
    api_key: "api_key_tenant_a_2026",
    founder_id: "usr_ta_owner",
  });
  const tenantB = await restaurants.create({
    id: "rest_tenant_b",
    name: "[Ресторан B]",
    api_key: "api_key_tenant_b_2026",
    founder_id: "usr_tb_owner",
  });
  // Третий ресторан демонстрирует подключение произвольного внешнего сайта ресторана
  // (см. INTEGRATION.md) через X-Restaurant-Key. Имя — универсальный placeholder,
  // как и у ресторанов A/B: брокер не должен знать о бренде конкретного сайта,
  // реальное название и оформление живут только на стороне сайта ресторана.
  const tenantC = await restaurants.create({
    id: "rest_tenant_c",
    name: "[Ресторан C — внешний сайт-интеграция]",
    api_key: "api_key_tenant_c_2026",
    founder_id: "usr_tc_owner",
  });

  const demoPasswordHash = hashPassword("password123");

  await users.create({ id: "usr_superadmin", restaurant_id: "system", email: "superadmin@saas.io", password_hash: demoPasswordHash, role: "super_admin" });
  await users.create({ id: "usr_ta_owner", restaurant_id: tenantA.id, email: "owner@tenant-a.io", password_hash: demoPasswordHash, role: "founder" });
  await users.create({ id: "usr_ta_manager", restaurant_id: tenantA.id, email: "manager@tenant-a.io", password_hash: demoPasswordHash, role: "manager" });
  await users.create({ id: "usr_ta_hostess", restaurant_id: tenantA.id, email: "hostess@tenant-a.io", password_hash: demoPasswordHash, role: "hostess" });
  await users.create({ id: "usr_ta_chef", restaurant_id: tenantA.id, email: "chef@tenant-a.io", password_hash: demoPasswordHash, role: "chef" });
  await users.create({ id: "usr_tb_owner", restaurant_id: tenantB.id, email: "owner@tenant-b.io", password_hash: demoPasswordHash, role: "founder" });
  await users.create({ id: "usr_tb_hostess", restaurant_id: tenantB.id, email: "hostess@tenant-b.io", password_hash: demoPasswordHash, role: "hostess" });
  await users.create({ id: "usr_tb_chef", restaurant_id: tenantB.id, email: "chef@tenant-b.io", password_hash: demoPasswordHash, role: "chef" });
  await users.create({ id: "usr_tc_owner", restaurant_id: tenantC.id, email: "owner@tenant-c.io", password_hash: demoPasswordHash, role: "founder" });
  await users.create({ id: "usr_tc_hostess", restaurant_id: tenantC.id, email: "hostess@tenant-c.io", password_hash: demoPasswordHash, role: "hostess" });
  await users.create({ id: "usr_tc_chef", restaurant_id: tenantC.id, email: "chef@tenant-c.io", password_hash: demoPasswordHash, role: "chef" });

  // Демо-код приглашения для самостоятельной регистрации нового founder'а (см. POST /auth/register).
  // Фиксированное значение — чтобы его можно было использовать в curl-тестах и документации.
  await inviteCodes.create({ code: "DEMO-0001-INVT", note: "Демо-код для тестовой регистрации нового основателя/ресторана" });

  const tablesSeed: Array<Omit<DiningTable, "id">> = [
    { restaurant_id: tenantA.id, table_number: 1, capacity: 2, x_pos: 15, y_pos: 20, current_status: "free" },
    { restaurant_id: tenantA.id, table_number: 2, capacity: 4, x_pos: 50, y_pos: 20, current_status: "reserved" },
    { restaurant_id: tenantA.id, table_number: 3, capacity: 4, x_pos: 85, y_pos: 20, current_status: "occupied" },
    { restaurant_id: tenantA.id, table_number: 4, capacity: 6, x_pos: 15, y_pos: 70, current_status: "free" },
    { restaurant_id: tenantA.id, table_number: 5, capacity: 2, x_pos: 50, y_pos: 70, current_status: "free" },
    { restaurant_id: tenantA.id, table_number: 6, capacity: 8, x_pos: 85, y_pos: 70, current_status: "occupied" },
    { restaurant_id: tenantB.id, table_number: 1, capacity: 2, x_pos: 20, y_pos: 30, current_status: "free" },
    { restaurant_id: tenantB.id, table_number: 2, capacity: 4, x_pos: 70, y_pos: 30, current_status: "reserved" },
    { restaurant_id: tenantB.id, table_number: 3, capacity: 6, x_pos: 20, y_pos: 75, current_status: "occupied" },
    { restaurant_id: tenantB.id, table_number: 4, capacity: 2, x_pos: 70, y_pos: 75, current_status: "free" },
  ];
  // Фиксированные id для предсказуемости демо-данных и ссылок ниже (резервации/заказы указывают на конкретные столы)
  const tIds = ["tbl_ta_1", "tbl_ta_2", "tbl_ta_3", "tbl_ta_4", "tbl_ta_5", "tbl_ta_6", "tbl_tb_1", "tbl_tb_2", "tbl_tb_3", "tbl_tb_4"];
  for (let i = 0; i < tablesSeed.length; i++) {
    await tables.create({ ...tablesSeed[i], id: tIds[i] });
  }

  // Tenant C — чистый, "только что подключённый" тенант без предзаполненных броней/заказов:
  // демонстрирует, что внешний сайт ресторана сам наполняет CRM через публичные client-эндпоинты.
  // Диапазон вместимости столов (2..12) покрывает любой размер группы гостей, который примет сайт ресторана.
  const tenantCTablesSeed: Array<Omit<DiningTable, "id">> = [
    { restaurant_id: tenantC.id, table_number: 1, capacity: 2, x_pos: 10, y_pos: 15, current_status: "free" },
    { restaurant_id: tenantC.id, table_number: 2, capacity: 2, x_pos: 30, y_pos: 15, current_status: "free" },
    { restaurant_id: tenantC.id, table_number: 3, capacity: 4, x_pos: 50, y_pos: 15, current_status: "free" },
    { restaurant_id: tenantC.id, table_number: 4, capacity: 4, x_pos: 70, y_pos: 15, current_status: "free" },
    { restaurant_id: tenantC.id, table_number: 5, capacity: 6, x_pos: 90, y_pos: 15, current_status: "free" },
    { restaurant_id: tenantC.id, table_number: 6, capacity: 6, x_pos: 10, y_pos: 55, current_status: "free" },
    { restaurant_id: tenantC.id, table_number: 7, capacity: 8, x_pos: 30, y_pos: 55, current_status: "free" },
    { restaurant_id: tenantC.id, table_number: 8, capacity: 8, x_pos: 50, y_pos: 55, current_status: "free" },
    { restaurant_id: tenantC.id, table_number: 9, capacity: 10, x_pos: 70, y_pos: 55, current_status: "free" },
    { restaurant_id: tenantC.id, table_number: 10, capacity: 12, x_pos: 90, y_pos: 55, current_status: "free" },
  ];
  const tcIds = ["tbl_tc_1", "tbl_tc_2", "tbl_tc_3", "tbl_tc_4", "tbl_tc_5", "tbl_tc_6", "tbl_tc_7", "tbl_tc_8", "tbl_tc_9", "tbl_tc_10"];
  for (let i = 0; i < tenantCTablesSeed.length; i++) {
    await tables.create({ ...tenantCTablesSeed[i], id: tcIds[i] });
  }

  const today = new Date().toISOString().split("T")[0];

  await reservations.create({
    id: "res_ta_1",
    restaurant_id: tenantA.id,
    customer_name: "[ФИО Клиента 1 / Guest Name 1]",
    customer_phone: "[+7 Телефон Клиента 1]",
    date: today,
    time: "19:00",
    guests_count: 3,
    table_id: "tbl_ta_2",
    status: "confirmed",
  });
  await reservations.create({
    id: "res_ta_2",
    restaurant_id: tenantA.id,
    customer_name: "[ФИО Клиента 2 / Guest Name 2]",
    customer_phone: "[+7 Телефон Клиента 2]",
    date: today,
    time: "21:30",
    guests_count: 2,
    table_id: "tbl_ta_5",
    status: "pending",
  });
  await reservations.create({
    id: "res_tb_1",
    restaurant_id: tenantB.id,
    customer_name: "[ФИО Клиента 3 / Guest Name 3]",
    customer_phone: "[+7 Телефон Клиента 3]",
    date: today,
    time: "20:00",
    guests_count: 4,
    table_id: "tbl_tb_2",
    status: "confirmed",
  });

  const order1 = await orders.create({
    id: "ord_ta_1",
    restaurant_id: tenantA.id,
    table_id: "tbl_ta_3",
    delivery_type: "in_restaurant",
    total_amount: 14200,
    payment_status: "paid",
    order_status: "cooking",
    sla_minutes: 15,
  });
  const order2 = await orders.create({
    id: "ord_ta_2",
    restaurant_id: tenantA.id,
    table_id: "tbl_ta_6",
    delivery_type: "in_restaurant",
    total_amount: 28500,
    payment_status: "paid",
    order_status: "new",
    sla_minutes: 15,
  });
  const order3 = await orders.create({
    id: "ord_tb_1",
    restaurant_id: tenantB.id,
    table_id: "tbl_tb_3",
    delivery_type: "in_restaurant",
    total_amount: 18900,
    payment_status: "paid",
    order_status: "cooking",
    sla_minutes: 20,
  });

  await orderItems.create({ id: "itm_ta1_1", order_id: order1.id, dish_name: "[Блюдо 1 / Dish 1]", quantity: 2, price_per_unit: 4500 });
  await orderItems.create({ id: "itm_ta1_2", order_id: order1.id, dish_name: "[Напиток 1 / Drink 1]", quantity: 2, price_per_unit: 2600 });
  await orderItems.create({ id: "itm_ta2_1", order_id: order2.id, dish_name: "[Блюдо 2 / Dish 2]", quantity: 1, price_per_unit: 19500 });
  await orderItems.create({ id: "itm_ta2_2", order_id: order2.id, dish_name: "[Блюдо 3 / Dish 3]", quantity: 2, price_per_unit: 4500 });
  await orderItems.create({ id: "itm_tb1_1", order_id: order3.id, dish_name: "[Блюдо 4 / Dish 4]", quantity: 1, price_per_unit: 12500 });
  await orderItems.create({ id: "itm_tb1_2", order_id: order3.id, dish_name: "[Напиток 2 / Drink 2]", quantity: 2, price_per_unit: 3200 });

  await paymentTransactions.create({ id: "txn_init_1", transaction_key: "idemp_key_ta_1", order_id: order1.id, amount: 14200, status: "success" });
  await paymentTransactions.create({ id: "txn_init_2", transaction_key: "idemp_key_ta_2", order_id: order2.id, amount: 28500, status: "success" });
  await paymentTransactions.create({ id: "txn_init_3", transaction_key: "idemp_key_tb_1", order_id: order3.id, amount: 18900, status: "success" });

  await menuItems.create({ restaurant_id: tenantA.id, name: "[Блюдо 1 / Dish 1]", price: 4500, category: "Горячее" });
  await menuItems.create({ restaurant_id: tenantA.id, name: "[Блюдо 2 / Dish 2]", price: 19500, category: "Горячее" });
  await menuItems.create({ restaurant_id: tenantA.id, name: "[Блюдо 3 / Dish 3]", price: 4500, category: "Горячее" });
  await menuItems.create({ restaurant_id: tenantA.id, name: "[Напиток 1 / Drink 1]", price: 2605, category: "Напитки" });
  await menuItems.create({ restaurant_id: tenantB.id, name: "[Блюдо 4 / Dish 4]", price: 12500, category: "Горячее" });
  await menuItems.create({ restaurant_id: tenantB.id, name: "[Напиток 2 / Drink 2]", price: 3200, category: "Напитки" });
  await menuItems.create({ restaurant_id: tenantB.id, name: "[Блюдо 5 / Dish 5]", price: 8500, category: "Горячее" });
  await menuItems.create({ restaurant_id: tenantB.id, name: "[Десерт 1 / Dessert 1]", price: 4000, category: "Десерты" });

  await menuItems.create({ restaurant_id: tenantC.id, name: "[Завтрак 1 / Breakfast 1]", price: 3600, category: "Завтраки" });
  await menuItems.create({ restaurant_id: tenantC.id, name: "[Горячее 1 / Main 1]", price: 4900, category: "Горячее" });
  await menuItems.create({ restaurant_id: tenantC.id, name: "[Горячее 2 / Main 2]", price: 3400, category: "Горячее" });
  await menuItems.create({ restaurant_id: tenantC.id, name: "[Напиток 1 / Drink 1]", price: 1800, category: "Напитки" });
  await menuItems.create({ restaurant_id: tenantC.id, name: "[Напиток 2 / Drink 2]", price: 1900, category: "Напитки" });
  await menuItems.create({ restaurant_id: tenantC.id, name: "[Десерт 1 / Dessert 1]", price: 2400, category: "Десерты" });
}

export const db = {
  restaurants,
  users,
  tables,
  reservations,
  orders,
  orderItems,
  paymentTransactions,
  menuItems,
  inviteCodes,
  systemDump,
  reset: seed,
};
