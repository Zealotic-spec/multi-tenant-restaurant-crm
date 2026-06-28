-- 001_init.sql
-- Multi-Tenant Restaurant CRM — начальная схема PostgreSQL (заменяет старую node:sqlite базу).
-- Все таблицы (кроме invite_codes) жёстко привязаны к restaurant_id. Изоляция тенантов
-- обеспечивается в server/db.ts параметризованными запросами (WHERE restaurant_id = $1) —
-- никогда конкатенацией строк. Эта миграция идемпотентна (IF NOT EXISTS) — безопасно
-- запускать повторно при каждом старте сервера.

CREATE TABLE IF NOT EXISTS restaurants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  api_key     TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  founder_id  TEXT,
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_restaurant ON users(restaurant_id);

-- Имя таблицы "dining_tables" (а не "tables") — зарезервированное слово ближе к SQL-стандарту
-- избегаем; JS-репозиторий всё равно называется db.tables, поэтому вызывающий код не меняется.
CREATE TABLE IF NOT EXISTS dining_tables (
  id             TEXT PRIMARY KEY,
  restaurant_id  TEXT NOT NULL,
  table_number   INTEGER NOT NULL,
  capacity       INTEGER NOT NULL,
  x_pos          DOUBLE PRECISION NOT NULL,
  y_pos          DOUBLE PRECISION NOT NULL,
  current_status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON dining_tables(restaurant_id);

CREATE TABLE IF NOT EXISTS reservations (
  id             TEXT PRIMARY KEY,
  restaurant_id  TEXT NOT NULL,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  date           TEXT NOT NULL, -- 'YYYY-MM-DD' как строка — формат идентичен клиенту, без таймзоны
  time           TEXT NOT NULL, -- 'HH:MM'
  guests_count   INTEGER NOT NULL,
  table_id       TEXT NOT NULL,
  status         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_res_restaurant ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_res_table_date ON reservations(table_id, date);

-- delivery_type ограничен CHECK-constraint'ом только двумя способами получения заказа —
-- курьерская доставка ("delivery") полностью удалена из бизнес-логики (см. Задачу 6).
CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,
  restaurant_id    TEXT NOT NULL,
  table_id         TEXT,
  delivery_type    VARCHAR(32) NOT NULL CHECK (delivery_type IN ('in_restaurant', 'takeaway')),
  delivery_address TEXT,
  customer_name    TEXT,
  customer_phone   TEXT,
  total_amount     NUMERIC NOT NULL,
  payment_status   TEXT NOT NULL,
  order_status     TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sla_minutes      INTEGER NOT NULL,
  archived_month   VARCHAR(7) -- 'YYYY-MM', NULL по умолчанию — резерв для финансового архива (Задача 12)
);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  dish_name      TEXT NOT NULL,
  quantity       INTEGER NOT NULL,
  price_per_unit NUMERIC NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id              TEXT PRIMARY KEY,
  transaction_key TEXT NOT NULL UNIQUE,
  order_id        TEXT NOT NULL,
  amount          NUMERIC NOT NULL,
  status          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  price         NUMERIC NOT NULL,
  category      TEXT,
  is_available  BOOLEAN NOT NULL DEFAULT TRUE,
  image_url     TEXT,
  description   TEXT,
  badge_label   TEXT,
  badge_color   TEXT
);
CREATE INDEX IF NOT EXISTS idx_menu_restaurant ON menu_items(restaurant_id);

-- Одноразовые коды-приглашения для регистрации founder-аккаунтов (POST /auth/register).
CREATE TABLE IF NOT EXISTS invite_codes (
  code            TEXT PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at         TIMESTAMPTZ,
  used_by_user_id TEXT,
  note            TEXT
);
