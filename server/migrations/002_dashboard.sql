-- 002_dashboard.sql
-- Dashboard extension: настройки бренда, iiko-интеграция, кэш аналитических данных.
-- Все таблицы идемпотентны (IF NOT EXISTS). restaurant_id — TEXT FK → restaurants.id.

-- Бренд и модульность: цвет, лого, шрифт, набор разделов дашборда.
CREATE TABLE IF NOT EXISTS restaurant_settings (
  restaurant_id   TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  primary_color   VARCHAR(7)  NOT NULL DEFAULT '#6366F1',
  logo_url        TEXT,
  font_family     VARCHAR(50) NOT NULL DEFAULT 'Inter',
  enabled_modules TEXT[]      NOT NULL DEFAULT ARRAY['analytics','menu','hall','staff','marketing']
);

-- Учётные данные iiko POS для каждого ресторана.
CREATE TABLE IF NOT EXISTS iiko_credentials (
  restaurant_id    TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  api_login        VARCHAR(255) NOT NULL,
  organization_ids TEXT[]       NOT NULL DEFAULT '{}',
  last_sync_at     TIMESTAMPTZ,
  pos_type         VARCHAR(20)  NOT NULL DEFAULT 'iiko'
);

-- Дневные финансовые агрегаты из iiko (выручка, метрики, методы оплаты).
CREATE TABLE IF NOT EXISTS analytics_cache (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  date             DATE        NOT NULL,
  revenue          NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit           NUMERIC(14,2) NOT NULL DEFAULT 0,
  avg_check        NUMERIC(10,2) NOT NULL DEFAULT 0,
  guests_count     INTEGER       NOT NULL DEFAULT 0,
  orders_count     INTEGER       NOT NULL DEFAULT 0,
  food_cost_pct    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cash_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  card_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  sbp_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  synced_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, date)
);
CREATE INDEX IF NOT EXISTS idx_analytics_rest_date ON analytics_cache(restaurant_id, date);

-- Статистика блюд за день: топ и аутсайдеры, среднее время приготовления.
CREATE TABLE IF NOT EXISTS menu_stats_cache (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  date            DATE        NOT NULL,
  dish_name       VARCHAR(255) NOT NULL,
  category        VARCHAR(100),
  orders_count    INTEGER       NOT NULL DEFAULT 0,
  revenue         NUMERIC(14,2) NOT NULL DEFAULT 0,
  avg_cook_time   INTEGER       NOT NULL DEFAULT 0,
  synced_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_stats_rest_date ON menu_stats_cache(restaurant_id, date);

-- Актуальный стоп-лист (JSONB-массив): обновляется при каждом синке.
CREATE TABLE IF NOT EXISTS stop_list_cache (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  items         JSONB       NOT NULL DEFAULT '[]',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Статусы столов из iiko: JSONB-массив объектов { number, status, guests }.
CREATE TABLE IF NOT EXISTS hall_status_cache (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  tables        JSONB       NOT NULL DEFAULT '[]',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KPI официантов за день: продажи, чаевые, среднее время обслуживания.
CREATE TABLE IF NOT EXISTS staff_kpi_cache (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    TEXT        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  date             DATE        NOT NULL,
  waiter_name      VARCHAR(255) NOT NULL,
  waiter_id        VARCHAR(100) NOT NULL,
  orders_count     INTEGER       NOT NULL DEFAULT 0,
  revenue          NUMERIC(14,2) NOT NULL DEFAULT 0,
  tips_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  avg_service_time INTEGER       NOT NULL DEFAULT 0,
  synced_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, date, waiter_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_kpi_rest_date ON staff_kpi_cache(restaurant_id, date);

-- Загрузка зала по часам за день (0-23).
CREATE TABLE IF NOT EXISTS peak_hours_cache (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  date          DATE    NOT NULL,
  hour          INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  guests_count  INTEGER NOT NULL DEFAULT 0,
  orders_count  INTEGER NOT NULL DEFAULT 0,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, date, hour)
);
CREATE INDEX IF NOT EXISTS idx_peak_hours_rest_date ON peak_hours_cache(restaurant_id, date);

-- Отзывы гостей (QR-меню или ручной ввод).
CREATE TABLE IF NOT EXISTS guest_feedback (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  rating        INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment       TEXT,
  source        VARCHAR(50) NOT NULL DEFAULT 'qr_menu',
  guest_name    VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_rest ON guest_feedback(restaurant_id, created_at DESC);
