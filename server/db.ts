import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { hashPassword } from "./utils/password";

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
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  guests_count: number;
  table_id: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  created_at: string;
}

export interface Order {
  id: string;
  restaurant_id: string;
  table_id?: string; // Обязателен при delivery_type = "in_restaurant"
  delivery_type: "in_restaurant" | "takeaway" | "delivery";
  delivery_address?: string; // Обязателен при delivery_type = "delivery"
  customer_name?: string;
  customer_phone?: string; // Важно для курьера при delivery_type = "delivery"
  total_amount: number;
  payment_status: "pending" | "paid" | "failed";
  // out_for_delivery — промежуточный статус только для delivery_type = "delivery" (курьер в пути)
  order_status: "new" | "cooking" | "ready" | "out_for_delivery" | "delivered";
  created_at: string;
  sla_minutes: number;
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
}

// ─── Подключение к SQLite (node:sqlite, встроен в Node >= 22.5, без зависимостей) ───

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), "data");
const DB_FILE = process.env.DB_PATH || path.join(DB_DIR, "crm.db");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const conn = new DatabaseSync(DB_FILE);
conn.exec("PRAGMA journal_mode = WAL;");
conn.exec("PRAGMA foreign_keys = ON;");

conn.exec(`
  CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_restaurant ON users(restaurant_id);

  CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    table_number INTEGER NOT NULL,
    capacity INTEGER NOT NULL,
    x_pos REAL NOT NULL,
    y_pos REAL NOT NULL,
    current_status TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);

  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    guests_count INTEGER NOT NULL,
    table_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_res_restaurant ON reservations(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_res_table_date ON reservations(table_id, date);

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    table_id TEXT,
    delivery_type TEXT NOT NULL,
    delivery_address TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    total_amount REAL NOT NULL,
    payment_status TEXT NOT NULL,
    order_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sla_minutes INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    dish_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price_per_unit REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

  CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    transaction_key TEXT NOT NULL UNIQUE,
    order_id TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category TEXT,
    is_available INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_menu_restaurant ON menu_items(restaurant_id);

  CREATE TABLE IF NOT EXISTS founder_invite_codes (
    code TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    used_at TEXT,
    used_by_user_id TEXT,
    note TEXT
  );
`);

// ─── Аддитивная миграция для уже существующих файлов БД ───
// CREATE TABLE IF NOT EXISTS не добавляет новые колонки в уже созданную таблицу,
// поэтому новые поля схемы (например delivery_address) нужно докатывать вручную.
// node:sqlite бросает исключение, если колонка уже существует — это и есть проверка идемпотентности.
function ensureColumn(table: string, column: string, definition: string) {
  try {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch {
    // Колонка уже существует — миграция уже применена, ничего не делаем.
  }
}
ensureColumn("orders", "delivery_address", "TEXT");
ensureColumn("orders", "customer_name", "TEXT");
ensureColumn("orders", "customer_phone", "TEXT");
ensureColumn("restaurants", "founder_id", "TEXT");
ensureColumn("restaurants", "archived_at", "TEXT");

// Переименование роли "tenant_owner" → "founder" для уже существующих БД (идемпотентно).
conn.exec("UPDATE users SET role = 'founder' WHERE role = 'tenant_owner'");
// Бэк-филл founder_id для ресторанов, заведённых до введения мультиресторанных основателей:
// первый найденный founder этого ресторана становится его владельцем.
conn.exec(`
  UPDATE restaurants
  SET founder_id = (SELECT id FROM users WHERE users.restaurant_id = restaurants.id AND users.role = 'founder' LIMIT 1)
  WHERE founder_id IS NULL
`);

// ─── Малые утилиты поверх node:sqlite ───

function toBool(value: unknown): boolean {
  return value === 1 || value === true;
}

function rowToMenuItem(row: any): MenuItem {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    name: row.name,
    price: row.price,
    category: row.category ?? undefined,
    is_available: toBool(row.is_available),
  };
}

// ─── Repositories ───

const restaurants = {
  findAll(): Restaurant[] {
    return conn.prepare("SELECT * FROM restaurants ORDER BY created_at ASC").all() as unknown as Restaurant[];
  },
  findAllPublic(): { id: string; name: string }[] {
    return conn.prepare("SELECT id, name FROM restaurants ORDER BY created_at ASC").all() as unknown as {
      id: string;
      name: string;
    }[];
  },
  findById(id: string): Restaurant | undefined {
    return conn.prepare("SELECT * FROM restaurants WHERE id = ?").get(id) as unknown as Restaurant | undefined;
  },
  findByApiKey(apiKey: string): Restaurant | undefined {
    return conn.prepare("SELECT * FROM restaurants WHERE api_key = ?").get(apiKey) as unknown as
      | Restaurant
      | undefined;
  },
  /** Все рестораны конкретного founder'а (мультиресторанное владение). По умолчанию без архивных. */
  findByFounder(founderId: string, opts?: { includeArchived?: boolean }): Restaurant[] {
    if (opts?.includeArchived) {
      return conn
        .prepare("SELECT * FROM restaurants WHERE founder_id = ? ORDER BY created_at ASC")
        .all(founderId) as unknown as Restaurant[];
    }
    return conn
      .prepare("SELECT * FROM restaurants WHERE founder_id = ? AND archived_at IS NULL ORDER BY created_at ASC")
      .all(founderId) as unknown as Restaurant[];
  },
  create(data: { name: string; api_key: string; id?: string; founder_id?: string | null }): Restaurant {
    const restaurant: Restaurant = {
      id: data.id || `rest_${randomUUID()}`,
      name: data.name,
      api_key: data.api_key,
      created_at: new Date().toISOString(),
      founder_id: data.founder_id ?? null,
      archived_at: null,
    };
    conn
      .prepare(
        "INSERT INTO restaurants (id, name, api_key, created_at, founder_id, archived_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(restaurant.id, restaurant.name, restaurant.api_key, restaurant.created_at, restaurant.founder_id, null);
    return restaurant;
  },
  /** Soft-delete: ресторан помечается архивным, но строки в БД не удаляются. */
  archive(id: string, founderId: string): Restaurant | undefined {
    const existing = restaurants.findById(id);
    if (!existing || existing.founder_id !== founderId || existing.archived_at) return undefined;
    const archived_at = new Date().toISOString();
    conn.prepare("UPDATE restaurants SET archived_at = ? WHERE id = ?").run(archived_at, id);
    return { ...existing, archived_at };
  },
};

const users = {
  findByEmail(email: string): User | undefined {
    return conn.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as unknown as
      | User
      | undefined;
  },
  findById(id: string): User | undefined {
    return conn.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as User | undefined;
  },
  findByRestaurant(restaurantId: string): User[] {
    return conn.prepare("SELECT * FROM users WHERE restaurant_id = ?").all(restaurantId) as unknown as User[];
  },
  findAllRedacted(): Omit<User, "password_hash">[] {
    return conn
      .prepare("SELECT id, restaurant_id, email, role FROM users ORDER BY restaurant_id ASC")
      .all() as unknown as Omit<User, "password_hash">[];
  },
  create(data: { restaurant_id: string; email: string; password_hash: string; role: Role; id?: string }): User {
    const user: User = {
      id: data.id || `usr_${randomUUID()}`,
      restaurant_id: data.restaurant_id,
      email: data.email.toLowerCase(),
      password_hash: data.password_hash,
      role: data.role,
    };
    conn
      .prepare("INSERT INTO users (id, restaurant_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, user.restaurant_id, user.email, user.password_hash, user.role);
    return user;
  },
};

const tables = {
  findByRestaurant(restaurantId: string): DiningTable[] {
    return conn
      .prepare("SELECT * FROM tables WHERE restaurant_id = ? ORDER BY table_number ASC")
      .all(restaurantId) as unknown as DiningTable[];
  },
  findByIdAndRestaurant(id: string, restaurantId: string): DiningTable | undefined {
    return conn.prepare("SELECT * FROM tables WHERE id = ? AND restaurant_id = ?").get(id, restaurantId) as
      unknown as DiningTable | undefined;
  },
  findByRestaurantAndNumber(restaurantId: string, tableNumber: number): DiningTable | undefined {
    return conn
      .prepare("SELECT * FROM tables WHERE restaurant_id = ? AND table_number = ?")
      .get(restaurantId, tableNumber) as unknown as DiningTable | undefined;
  },
  create(data: Omit<DiningTable, "id"> & { id?: string }): DiningTable {
    const table: DiningTable = { id: data.id || `tbl_${randomUUID()}`, ...data };
    conn
      .prepare(
        "INSERT INTO tables (id, restaurant_id, table_number, capacity, x_pos, y_pos, current_status) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(table.id, table.restaurant_id, table.table_number, table.capacity, table.x_pos, table.y_pos, table.current_status);
    return table;
  },
  update(id: string, restaurantId: string, patch: Partial<DiningTable>): DiningTable | undefined {
    const existing = tables.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    const merged: DiningTable = { ...existing, ...patch, id: existing.id, restaurant_id: existing.restaurant_id };
    conn
      .prepare(
        "UPDATE tables SET capacity = ?, x_pos = ?, y_pos = ?, current_status = ? WHERE id = ? AND restaurant_id = ?"
      )
      .run(merged.capacity, merged.x_pos, merged.y_pos, merged.current_status, id, restaurantId);
    return merged;
  },
  setStatus(id: string, status: DiningTable["current_status"]) {
    conn.prepare("UPDATE tables SET current_status = ? WHERE id = ?").run(status, id);
  },
  delete(id: string, restaurantId: string): DiningTable | undefined {
    const existing = tables.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    conn.prepare("DELETE FROM tables WHERE id = ? AND restaurant_id = ?").run(id, restaurantId);
    return existing;
  },
};

const reservations = {
  findByRestaurant(restaurantId: string): Reservation[] {
    return conn
      .prepare(
        "SELECT * FROM reservations WHERE restaurant_id = ? ORDER BY date DESC, time DESC"
      )
      .all(restaurantId) as unknown as Reservation[];
  },
  findByTableAndDate(tableId: string, date: string): Reservation[] {
    return conn
      .prepare("SELECT * FROM reservations WHERE table_id = ? AND date = ?")
      .all(tableId, date) as unknown as Reservation[];
  },
  findByIdAndRestaurant(id: string, restaurantId: string): Reservation | undefined {
    return conn.prepare("SELECT * FROM reservations WHERE id = ? AND restaurant_id = ?").get(id, restaurantId) as
      unknown as Reservation | undefined;
  },
  create(data: Omit<Reservation, "id" | "created_at"> & { id?: string }): Reservation {
    const reservation: Reservation = {
      id: data.id || `res_${randomUUID()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    conn
      .prepare(
        `INSERT INTO reservations
          (id, restaurant_id, customer_name, customer_phone, date, time, guests_count, table_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reservation.id,
        reservation.restaurant_id,
        reservation.customer_name,
        reservation.customer_phone,
        reservation.date,
        reservation.time,
        reservation.guests_count,
        reservation.table_id,
        reservation.status,
        reservation.created_at
      );
    return reservation;
  },
  updateStatus(id: string, restaurantId: string, status: Reservation["status"]): Reservation | undefined {
    const existing = reservations.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    conn
      .prepare("UPDATE reservations SET status = ? WHERE id = ? AND restaurant_id = ?")
      .run(status, id, restaurantId);
    return { ...existing, status };
  },
  /** Есть ли активная (будущая, не отменённая/завершённая) бронь — блокирует архивацию ресторана. */
  hasFutureActiveByRestaurant(restaurantId: string): boolean {
    const row = conn
      .prepare(
        `SELECT 1 FROM reservations
         WHERE restaurant_id = ?
           AND status IN ('pending', 'confirmed')
           AND (date > date('now', 'localtime') OR (date = date('now', 'localtime') AND time >= time('now', 'localtime')))
         LIMIT 1`
      )
      .get(restaurantId);
    return !!row;
  },
};

const orders = {
  findByRestaurant(restaurantId: string, opts?: { paymentStatus?: Order["payment_status"] }): Order[] {
    if (opts?.paymentStatus) {
      return conn
        .prepare("SELECT * FROM orders WHERE restaurant_id = ? AND payment_status = ? ORDER BY created_at DESC")
        .all(restaurantId, opts.paymentStatus) as unknown as Order[];
    }
    return conn
      .prepare("SELECT * FROM orders WHERE restaurant_id = ? ORDER BY created_at DESC")
      .all(restaurantId) as unknown as Order[];
  },
  findById(id: string): Order | undefined {
    return conn.prepare("SELECT * FROM orders WHERE id = ?").get(id) as unknown as Order | undefined;
  },
  findByIdAndRestaurant(id: string, restaurantId: string): Order | undefined {
    return conn.prepare("SELECT * FROM orders WHERE id = ? AND restaurant_id = ?").get(id, restaurantId) as
      unknown as Order | undefined;
  },
  create(data: Omit<Order, "id" | "created_at"> & { id?: string }): Order {
    const order: Order = {
      id: data.id || `ord_${randomUUID()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    conn
      .prepare(
        `INSERT INTO orders
          (id, restaurant_id, table_id, delivery_type, delivery_address, customer_name, customer_phone, total_amount, payment_status, order_status, created_at, sla_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
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
        order.sla_minutes
      );
    return order;
  },
  updatePaymentStatus(id: string, payment_status: Order["payment_status"], order_status?: Order["order_status"]) {
    if (order_status) {
      conn
        .prepare("UPDATE orders SET payment_status = ?, order_status = ? WHERE id = ?")
        .run(payment_status, order_status, id);
    } else {
      conn.prepare("UPDATE orders SET payment_status = ? WHERE id = ?").run(payment_status, id);
    }
  },
  updateOrderStatus(id: string, restaurantId: string, order_status: Order["order_status"]): Order | undefined {
    const existing = orders.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    conn
      .prepare("UPDATE orders SET order_status = ? WHERE id = ? AND restaurant_id = ?")
      .run(order_status, id, restaurantId);
    return { ...existing, order_status };
  },
  /** Есть ли незавершённый заказ (не "delivered") — блокирует архивацию ресторана. */
  hasActiveByRestaurant(restaurantId: string): boolean {
    const row = conn
      .prepare("SELECT 1 FROM orders WHERE restaurant_id = ? AND order_status != 'delivered' LIMIT 1")
      .get(restaurantId);
    return !!row;
  },
};

const orderItems = {
  findByOrder(orderId: string): OrderItem[] {
    return conn.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId) as unknown as OrderItem[];
  },
  create(data: Omit<OrderItem, "id"> & { id?: string }): OrderItem {
    const item: OrderItem = { id: data.id || `itm_${randomUUID()}`, ...data };
    conn
      .prepare("INSERT INTO order_items (id, order_id, dish_name, quantity, price_per_unit) VALUES (?, ?, ?, ?, ?)")
      .run(item.id, item.order_id, item.dish_name, item.quantity, item.price_per_unit);
    return item;
  },
};

const paymentTransactions = {
  findByKey(transactionKey: string): PaymentTransaction | undefined {
    return conn.prepare("SELECT * FROM payment_transactions WHERE transaction_key = ?").get(transactionKey) as
      unknown as PaymentTransaction | undefined;
  },
  create(data: Omit<PaymentTransaction, "id" | "created_at"> & { id?: string }): PaymentTransaction {
    const tx: PaymentTransaction = {
      id: data.id || `txn_${randomUUID()}`,
      created_at: new Date().toISOString(),
      ...data,
    };
    conn
      .prepare(
        "INSERT INTO payment_transactions (id, transaction_key, order_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(tx.id, tx.transaction_key, tx.order_id, tx.amount, tx.status, tx.created_at);
    return tx;
  },
};

const menuItems = {
  findByRestaurant(restaurantId: string): MenuItem[] {
    const rows = conn
      .prepare("SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY category ASC, name ASC")
      .all(restaurantId);
    return rows.map(rowToMenuItem);
  },
  findByIdAndRestaurant(id: string, restaurantId: string): MenuItem | undefined {
    const row = conn.prepare("SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?").get(id, restaurantId);
    return row ? rowToMenuItem(row) : undefined;
  },
  create(data: { restaurant_id: string; name: string; price: number; category?: string; is_available?: boolean; id?: string }): MenuItem {
    const item: MenuItem = {
      id: data.id || `menu_${randomUUID()}`,
      restaurant_id: data.restaurant_id,
      name: data.name,
      price: data.price,
      category: data.category,
      is_available: data.is_available ?? true,
    };
    conn
      .prepare(
        "INSERT INTO menu_items (id, restaurant_id, name, price, category, is_available) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(item.id, item.restaurant_id, item.name, item.price, item.category ?? null, item.is_available ? 1 : 0);
    return item;
  },
  update(id: string, restaurantId: string, patch: Partial<Omit<MenuItem, "id" | "restaurant_id">>): MenuItem | undefined {
    const existing = menuItems.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    const merged: MenuItem = { ...existing, ...patch };
    conn
      .prepare("UPDATE menu_items SET name = ?, price = ?, category = ?, is_available = ? WHERE id = ? AND restaurant_id = ?")
      .run(merged.name, merged.price, merged.category ?? null, merged.is_available ? 1 : 0, id, restaurantId);
    return merged;
  },
  delete(id: string, restaurantId: string): MenuItem | undefined {
    const existing = menuItems.findByIdAndRestaurant(id, restaurantId);
    if (!existing) return undefined;
    conn.prepare("DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?").run(id, restaurantId);
    return existing;
  },
};

// Одноразовые коды-приглашения для регистрации founder-аккаунтов: защита от того, чтобы
// CRM мог бесплатно подключить кто угодно — код выдаёт лично super_admin каждому клиенту.
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов (0/O, 1/I)
  let code = "";
  for (let group = 0; group < 3; group++) {
    if (group > 0) code += "-";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const inviteCodes = {
  findAll(): FounderInviteCode[] {
    return conn
      .prepare("SELECT * FROM founder_invite_codes ORDER BY created_at DESC")
      .all() as unknown as FounderInviteCode[];
  },
  findByCode(code: string): FounderInviteCode | undefined {
    return conn.prepare("SELECT * FROM founder_invite_codes WHERE code = ?").get(code.trim().toUpperCase()) as
      unknown as FounderInviteCode | undefined;
  },
  create(data?: { note?: string; code?: string }): FounderInviteCode {
    let code = data?.code ? data.code.trim().toUpperCase() : generateInviteCode();
    while (inviteCodes.findByCode(code)) code = generateInviteCode(); // защита от редкой коллизии (и от занятого фикс-кода)
    const invite: FounderInviteCode = {
      code,
      created_at: new Date().toISOString(),
      used_at: null,
      used_by_user_id: null,
      note: data?.note ?? null,
    };
    conn
      .prepare("INSERT INTO founder_invite_codes (code, created_at, used_at, used_by_user_id, note) VALUES (?, ?, ?, ?, ?)")
      .run(invite.code, invite.created_at, null, null, invite.note);
    return invite;
  },
  markUsed(code: string, usedByUserId: string) {
    conn
      .prepare("UPDATE founder_invite_codes SET used_at = ?, used_by_user_id = ? WHERE code = ?")
      .run(new Date().toISOString(), usedByUserId, code.trim().toUpperCase());
  },
};

// ─── Сервисные операции: diagnostics dump (только для super_admin) и reset/seed ───

function isEmpty(): boolean {
  const row = conn.prepare("SELECT COUNT(*) as count FROM restaurants").get() as { count: number };
  return row.count === 0;
}

function systemDump() {
  return {
    restaurants: restaurants.findAll(),
    users: users.findAllRedacted(),
    tables: conn.prepare("SELECT * FROM tables").all(),
    reservations: conn.prepare("SELECT * FROM reservations").all(),
    orders: conn.prepare("SELECT * FROM orders").all(),
    orderItems: conn.prepare("SELECT * FROM order_items").all(),
    menuItems: conn.prepare("SELECT * FROM menu_items").all(),
    inviteCodes: inviteCodes.findAll(),
  };
}

function wipeAll() {
  conn.exec(`
    DELETE FROM payment_transactions;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM reservations;
    DELETE FROM menu_items;
    DELETE FROM tables;
    DELETE FROM users;
    DELETE FROM restaurants;
    DELETE FROM founder_invite_codes;
  `);
}

/** Демо-сид: 2 тестовых ресторана с захэшированными паролями (использовать только для разработки/демо). */
function seed() {
  wipeAll();

  // Фиксированные id founder-пользователей нужны заранее: founder_id ресторана
  // указывает на них, а сами строки users создаются чуть ниже.
  const tenantA = restaurants.create({
    id: "rest_tenant_a",
    name: "[Название организации A / Tenant A]",
    api_key: "api_key_tenant_a_2026",
    founder_id: "usr_ta_owner",
  });
  const tenantB = restaurants.create({
    id: "rest_tenant_b",
    name: "[Название организации B / Tenant B]",
    api_key: "api_key_tenant_b_2026",
    founder_id: "usr_tb_owner",
  });
  // Третий тенант демонстрирует подключение произвольного внешнего сайта ресторана
  // (см. INTEGRATION.md) через X-Restaurant-Key. Имя — универсальный placeholder,
  // как и у tenant_a/tenant_b: брокер не должен знать о бренде конкретного сайта,
  // реальное название и оформление живут только на стороне сайта ресторана.
  const tenantC = restaurants.create({
    id: "rest_tenant_c",
    name: "[Название организации C / Tenant C — внешний сайт-интеграция]",
    api_key: "api_key_tenant_c_2026",
    founder_id: "usr_tc_owner",
  });

  const demoPasswordHash = hashPassword("password123");

  users.create({ id: "usr_superadmin", restaurant_id: "system", email: "superadmin@saas.io", password_hash: demoPasswordHash, role: "super_admin" });
  users.create({ id: "usr_ta_owner", restaurant_id: tenantA.id, email: "owner@tenant-a.io", password_hash: demoPasswordHash, role: "founder" });
  users.create({ id: "usr_ta_manager", restaurant_id: tenantA.id, email: "manager@tenant-a.io", password_hash: demoPasswordHash, role: "manager" });
  users.create({ id: "usr_ta_hostess", restaurant_id: tenantA.id, email: "hostess@tenant-a.io", password_hash: demoPasswordHash, role: "hostess" });
  users.create({ id: "usr_ta_chef", restaurant_id: tenantA.id, email: "chef@tenant-a.io", password_hash: demoPasswordHash, role: "chef" });
  users.create({ id: "usr_tb_owner", restaurant_id: tenantB.id, email: "owner@tenant-b.io", password_hash: demoPasswordHash, role: "founder" });
  users.create({ id: "usr_tb_hostess", restaurant_id: tenantB.id, email: "hostess@tenant-b.io", password_hash: demoPasswordHash, role: "hostess" });
  users.create({ id: "usr_tb_chef", restaurant_id: tenantB.id, email: "chef@tenant-b.io", password_hash: demoPasswordHash, role: "chef" });
  users.create({ id: "usr_tc_owner", restaurant_id: tenantC.id, email: "owner@tenant-c.io", password_hash: demoPasswordHash, role: "founder" });
  users.create({ id: "usr_tc_hostess", restaurant_id: tenantC.id, email: "hostess@tenant-c.io", password_hash: demoPasswordHash, role: "hostess" });
  users.create({ id: "usr_tc_chef", restaurant_id: tenantC.id, email: "chef@tenant-c.io", password_hash: demoPasswordHash, role: "chef" });

  // Демо-код приглашения для самостоятельной регистрации нового founder'а (см. POST /auth/register).
  // Фиксированное значение — чтобы его можно было использовать в curl-тестах и документации.
  inviteCodes.create({ code: "DEMO-0001-INVT", note: "Демо-код для тестовой регистрации нового основателя/организации" });

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
  tablesSeed.forEach((t, i) => tables.create({ ...t, id: tIds[i] }));

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
  tenantCTablesSeed.forEach((t, i) => tables.create({ ...t, id: tcIds[i] }));

  const today = new Date().toISOString().split("T")[0];

  reservations.create({
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
  reservations.create({
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
  reservations.create({
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

  const order1 = orders.create({
    id: "ord_ta_1",
    restaurant_id: tenantA.id,
    table_id: "tbl_ta_3",
    delivery_type: "in_restaurant",
    total_amount: 14200,
    payment_status: "paid",
    order_status: "cooking",
    sla_minutes: 15,
  });
  const order2 = orders.create({
    id: "ord_ta_2",
    restaurant_id: tenantA.id,
    table_id: "tbl_ta_6",
    delivery_type: "in_restaurant",
    total_amount: 28500,
    payment_status: "paid",
    order_status: "new",
    sla_minutes: 15,
  });
  const order3 = orders.create({
    id: "ord_tb_1",
    restaurant_id: tenantB.id,
    table_id: "tbl_tb_3",
    delivery_type: "in_restaurant",
    total_amount: 18900,
    payment_status: "paid",
    order_status: "cooking",
    sla_minutes: 20,
  });

  orderItems.create({ id: "itm_ta1_1", order_id: order1.id, dish_name: "[Блюдо 1 / Dish 1]", quantity: 2, price_per_unit: 4500 });
  orderItems.create({ id: "itm_ta1_2", order_id: order1.id, dish_name: "[Напиток 1 / Drink 1]", quantity: 2, price_per_unit: 2600 });
  orderItems.create({ id: "itm_ta2_1", order_id: order2.id, dish_name: "[Блюдо 2 / Dish 2]", quantity: 1, price_per_unit: 19500 });
  orderItems.create({ id: "itm_ta2_2", order_id: order2.id, dish_name: "[Блюдо 3 / Dish 3]", quantity: 2, price_per_unit: 4500 });
  orderItems.create({ id: "itm_tb1_1", order_id: order3.id, dish_name: "[Блюдо 4 / Dish 4]", quantity: 1, price_per_unit: 12500 });
  orderItems.create({ id: "itm_tb1_2", order_id: order3.id, dish_name: "[Напиток 2 / Drink 2]", quantity: 2, price_per_unit: 3200 });

  paymentTransactions.create({ id: "txn_init_1", transaction_key: "idemp_key_ta_1", order_id: order1.id, amount: 14200, status: "success" });
  paymentTransactions.create({ id: "txn_init_2", transaction_key: "idemp_key_ta_2", order_id: order2.id, amount: 28500, status: "success" });
  paymentTransactions.create({ id: "txn_init_3", transaction_key: "idemp_key_tb_1", order_id: order3.id, amount: 18900, status: "success" });

  menuItems.create({ restaurant_id: tenantA.id, name: "[Блюдо 1 / Dish 1]", price: 4500, category: "Горячее" });
  menuItems.create({ restaurant_id: tenantA.id, name: "[Блюдо 2 / Dish 2]", price: 19500, category: "Горячее" });
  menuItems.create({ restaurant_id: tenantA.id, name: "[Блюдо 3 / Dish 3]", price: 4500, category: "Горячее" });
  menuItems.create({ restaurant_id: tenantA.id, name: "[Напиток 1 / Drink 1]", price: 2605, category: "Напитки" });
  menuItems.create({ restaurant_id: tenantB.id, name: "[Блюдо 4 / Dish 4]", price: 12500, category: "Горячее" });
  menuItems.create({ restaurant_id: tenantB.id, name: "[Напиток 2 / Drink 2]", price: 3200, category: "Напитки" });
  menuItems.create({ restaurant_id: tenantB.id, name: "[Блюдо 5 / Dish 5]", price: 8500, category: "Горячее" });
  menuItems.create({ restaurant_id: tenantB.id, name: "[Десерт 1 / Dessert 1]", price: 4000, category: "Десерты" });

  menuItems.create({ restaurant_id: tenantC.id, name: "[Завтрак 1 / Breakfast 1]", price: 3600, category: "Завтраки" });
  menuItems.create({ restaurant_id: tenantC.id, name: "[Горячее 1 / Main 1]", price: 4900, category: "Горячее" });
  menuItems.create({ restaurant_id: tenantC.id, name: "[Горячее 2 / Main 2]", price: 3400, category: "Горячее" });
  menuItems.create({ restaurant_id: tenantC.id, name: "[Напиток 1 / Drink 1]", price: 1800, category: "Напитки" });
  menuItems.create({ restaurant_id: tenantC.id, name: "[Напиток 2 / Drink 2]", price: 1900, category: "Напитки" });
  menuItems.create({ restaurant_id: tenantC.id, name: "[Десерт 1 / Dessert 1]", price: 2400, category: "Десерты" });
}

if (isEmpty()) {
  seed();
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
