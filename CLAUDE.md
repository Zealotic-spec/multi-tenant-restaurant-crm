# Restaurant SaaS Dashboard — Инструкции для Claude

Ты работаешь внутри **multi-tenant SaaS-платформы для управления ресторанами**. Система обслуживает несколько независимых ресторанов (тенантов) в рамках одной базы данных. Главный инвариант, который нельзя нарушить никогда: данные одного ресторана не должны попасть к другому.

---

## Архитектура системы

### Три слоя

**Слой 1: База данных (PostgreSQL)**
Единственный источник правды. Все данные изолированы по `restaurant_id`. Миграции идемпотентны и применяются автоматически при старте сервера. Прямой доступ к пулу — только через `server/db.ts` (репозитории) или `server/pgdb.ts` (pool для сложных запросов в контроллерах дашборда).

**Слой 2: API-сервер (Node.js + Express, порт 3001)**
Единственная точка входа в систему. Три типа аутентификации в зависимости от роута:
- `X-Restaurant-Key` — для внешних сайтов ресторанов (заказы, брони от гостей)
- `Bearer JWT` — для CRM-дашборда (сотрудники ресторана)
- Без токена — публичные данные (каталог, QR-меню)

**Слой 3: Дашборд (Next.js 15, порт 3000)**
Фронтенд для управляющих. Работает только с Bearer JWT. Все запросы проксируются через Next.js rewrites (`/api/v1` → `http://localhost:3001/api/v1`). JWT хранится в `localStorage`. Роль пользователя читается из JWT payload — никогда не из отдельного API-запроса на каждый рендер.

### Почему именно так

Разделение на клиентский (`X-Restaurant-Key`) и CRM (`Bearer JWT`) API — это сознательное решение. Внешний сайт ресторана интегрируется через API-ключ и не знает ничего о JWT и ролях внутри CRM. Это позволяет ресторану менять команду (увольнять, нанимать) без каких-либо изменений на их публичном сайте. Два независимых канала — две независимые поверхности безопасности.

---

## Стек

| Компонент | Технология |
|-----------|-----------|
| Бэкенд | Node.js + TypeScript + Express |
| Фронтенд | Next.js 15 + React 19 + Tailwind CSS 3 + Recharts |
| База данных | PostgreSQL (драйвер `pg`, pool → `server/pgdb.ts`) |
| Аутентификация | JWT (12h), пароли scrypt через Node crypto |
| POS-интеграция | iikoCloud OLAP API + mock-фоллбэк |
| Уведомления | Twilio (WhatsApp/SMS) + Resend (Email) + Outgoing Webhooks |
| Cron | node-cron: синк iiko каждые 15 мин, напоминания о бронях каждые 5 мин, очистка в 04:00 UTC |
| Сборка бэкенда | esbuild → `dist/server.cjs` |

---

## Запуск

```bash
# Бэкенд (порт 3001)
npm run dev

# Фронтенд (порт 3000)
cd frontend && npm run dev
```

**Обязательные переменные окружения** (`.env.example`):
```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=restaurant_crm
JWT_SECRET=minimum-16-chars   # обязателен в production
NODE_ENV=development
PORT=3001
```

**Первый запуск на чистой БД:**
```bash
npx tsx scripts/create-super-admin.ts
```
Миграции (`server/migrations/001_init.sql`, `002_dashboard.sql`) применяются автоматически при каждом старте сервера через `initDatabase()` — они идемпотентны, дублей не создадут.

**Демо-пользователи после seed:**
| Email | Пароль | Роль | Ресторан |
|-------|--------|------|----------|
| `superadmin@saas.io` | `password123` | super_admin | system |
| `owner@tenant-a.io` | `password123` | founder | Ресторан A |
| `manager@tenant-a.io` | `password123` | manager | Ресторан A |
| `hostess@tenant-a.io` | `password123` | hostess | Ресторан A |
| `chef@tenant-a.io` | `password123` | chef | Ресторан A |
| `owner@tenant-b.io` | `password123` | founder | Ресторан B |

---

## Роли и права доступа

```
super_admin → founder → manager → hostess / chef
```

| Роль | Что может |
|------|-----------|
| `super_admin` | Всё: управление тенантами, invite-коды, системные операции, db-dump |
| `founder` | Свои рестораны: вся аналитика, сотрудники, меню, настройки, переключение между ресторанами |
| `manager` | Один ресторан: то же что founder, кроме архивации ресторана |
| `hostess` | Только бронирования и статус столов |
| `chef` | Только заказы и кухонный экран |

**Как работает проверка роли:**
1. Middleware `crmTenantAuth` верифицирует JWT и делает **повторный запрос в БД** (`findById`), чтобы поймать уволенных сотрудников — чей JWT ещё не истёк, но запись удалена
2. Если роль в БД не совпадает с ролью в JWT — немедленный отказ (403)
3. `requireRole(["founder", "manager"])` — проверяет список разрешённых ролей; `super_admin` проходит всегда
4. Роль никогда не читается из тела запроса — только из верифицированного `req.user.role`

---

## Полная карта API (`/api/v1/...`)

### Публичные (без токена)
```
POST /auth/register              Регистрация founder по invite-коду (создаёт ресторан)
POST /auth/login                 Вход (возвращает JWT)
GET  /auth/me                    Профиль текущего пользователя
GET  /public/restaurants         Каталог ресторанов для QR-меню
```

### Клиентские (X-Restaurant-Key)
```
POST /client/reservations        Создать бронь (с защитой от овербукинга ±1.5ч)
POST /client/orders              Создать заказ (in_restaurant требует активной брони)
POST /client/payments/webhook    Подтвердить оплату (идемпотентно по transaction_key)
```

### CRM — Дашборд (Bearer JWT)
```
GET  /crm/dashboard/analytics    Финансы за период (from/to, default 30 дней)
GET  /crm/dashboard/menu-stats   Статистика блюд (from/to, default 7 дней)
GET  /crm/dashboard/stop-list    Актуальный стоп-лист из iiko
GET  /crm/dashboard/hall         Статусы столов из iiko
GET  /crm/dashboard/staff-kpi    KPI официантов (from/to, default 30 дней)
GET  /crm/dashboard/peak-hours   Пиковые часы (from/to, default 30 дней)
GET  /crm/dashboard/feedback     Отзывы гостей (последние 50 + avg_rating по всем)
POST /crm/dashboard/feedback     Добавить отзыв вручную
```

### CRM — Операции (Bearer JWT)
```
GET    /crm/reservations         Список броней ресторана          (founder, manager, hostess)
PATCH  /crm/reservations/:id     Сменить статус брони             (founder, manager, hostess)
GET    /crm/orders               Активные заказы (только paid)    (founder, manager, chef)
PATCH  /crm/orders/:id           Продвинуть статус заказа         (founder, manager, chef)
GET    /crm/finance/months       Список месяцев с суммами         (founder, manager)
GET    /crm/finance/export       Экспорт заказов за месяц         (founder, manager)
```

### CRM — Управление (Bearer JWT)
```
GET    /crm/employees            Список сотрудников ресторана     (founder, manager)
POST   /crm/employees            Нанять сотрудника                (founder, manager)
DELETE /crm/employees/:id        Уволить сотрудника               (founder, manager)
POST   /crm/employees/:id/reset-password  Сбросить пароль         (founder, manager)

GET    /crm/tables               Столы ресторана                  (все роли)
POST   /crm/tables               Добавить стол                    (founder, manager, hostess)
PATCH  /crm/tables/:id           Изменить стол / статус           (founder, manager, hostess)
DELETE /crm/tables/:id           Удалить стол                     (founder, manager)

GET    /crm/menu                 Меню ресторана                   (все роли)
POST   /crm/menu                 Добавить блюдо                   (founder, manager)
PATCH  /crm/menu/:id             Редактировать блюдо              (founder, manager)
DELETE /crm/menu/:id             Удалить блюдо                    (founder, manager)

GET    /crm/restaurant/settings  Настройки бренда                 (founder, manager)
PATCH  /crm/restaurant/settings  Изменить настройки               (founder)

GET    /crm/iiko/status          Статус интеграции iiko           (founder, manager)
POST   /crm/iiko/credentials     Сохранить учётные данные iiko    (founder)
POST   /crm/iiko/sync            Запустить ручной синк            (founder, manager)
```

### CRM — Founder (Bearer JWT, только founder)
```
GET    /crm/founder/restaurants         Мои рестораны
POST   /crm/founder/restaurants         Добавить ресторан
DELETE /crm/founder/restaurants/:id     Архивировать ресторан
POST   /crm/founder/switch-restaurant   Переключить активный ресторан (перевыдаёт JWT)
```

### Системные (только super_admin)
```
GET  /crm/restaurants          Все тенанты в системе
POST /crm/restaurants          Создать ресторан вручную
GET  /crm/invite-codes         Список invite-кодов
POST /crm/invite-codes         Сгенерировать invite-код
GET  /api/v1/system/logs       Системные логи
POST /api/v1/system/logs/clear Очистить логи
GET  /api/v1/system/db-dump    Дамп всей БД
POST /api/v1/system/db-reset   Сброс к демо-данным (ОПАСНО)
```

---

## Модули дашборда (фронтенд)

| Роут | Модуль | Источник данных | Роли |
|------|--------|-----------------|------|
| `/dashboard/analytics` | Финансы | `analytics_cache` | founder, manager |
| `/dashboard/menu` | Статистика блюд + стоп-лист | `menu_stats_cache`, `stop_list_cache` | founder, manager, chef |
| `/dashboard/hall` | Статус столов | `hall_status_cache` | founder, manager, hostess |
| `/dashboard/staff` | KPI официантов | `staff_kpi_cache` | founder, manager |
| `/dashboard/marketing` | Отзывы + пиковые часы | `guest_feedback`, `peak_hours_cache` | founder, manager |
| `/dashboard/settings` | iiko + бренд | `iiko_credentials`, `restaurant_settings` | founder |
| `/dashboard/reservations` | Управление бронями | `reservations` | founder, manager, hostess |
| `/dashboard/orders` | Кухонный экран | `orders`, `order_items` | founder, manager, chef |
| `/dashboard/employees` | Управление персоналом | `users` | founder, manager |
| `/dashboard/menu-editor` | CRUD меню | `menu_items` | founder, manager |

**Управление модулями:** каждый ресторан может включать/выключать модули через `restaurant_settings.enabled_modules`. Sidebar фильтрует пункты меню по этому массиву. Дефолтный набор всех модулей задаётся в `dashboard.controller.ts → getRestaurantSettings`.

---

## База данных

### Миграция 001 — ядро системы
```
restaurants          id, name, api_key, founder_id, archived_at
users                id, restaurant_id, email, password_hash, role
dining_tables        id, restaurant_id, table_number, capacity, x_pos, y_pos, current_status
reservations         id, restaurant_id, customer_name, customer_phone, date, time, guests_count, table_id, status
orders               id, restaurant_id, table_id, delivery_type, total_amount, payment_status, order_status, sla_minutes
order_items          id, order_id, dish_name, quantity, price_per_unit
payment_transactions id, transaction_key, order_id, amount, status  ← UNIQUE(transaction_key)
menu_items           id, restaurant_id, name, price, category, is_available, image_url, description
invite_codes         code, created_at, used_at, used_by_user_id, note
```

### Миграция 002 — дашборд и кэш iiko
```
restaurant_settings  restaurant_id, primary_color, logo_url, font_family, enabled_modules
iiko_credentials     restaurant_id, api_login, organization_ids, last_sync_at, pos_type
analytics_cache      restaurant_id, date, revenue, profit, avg_check, guests_count, ...  UNIQUE(restaurant_id, date)
menu_stats_cache     restaurant_id, date, dish_name, category, orders_count, revenue, avg_cook_time
stop_list_cache      restaurant_id, items (JSONB), synced_at
hall_status_cache    restaurant_id, tables (JSONB), synced_at
staff_kpi_cache      restaurant_id, date, waiter_id, waiter_name, orders_count, revenue, tips_amount  UNIQUE(restaurant_id, date, waiter_id)
peak_hours_cache     restaurant_id, date, hour, guests_count, orders_count  UNIQUE(restaurant_id, date, hour)
guest_feedback       restaurant_id, rating (1-5), comment, source, guest_name, created_at
```

### Миграция 003 — ограничения и индексы (накатывается автоматически)
```sql
ALTER TABLE dining_tables ADD CONSTRAINT dining_tables_status_check
  CHECK (current_status IN ('free', 'reserved', 'occupied'));
```

**Паттерны работы с БД:**
- Простые CRUD-операции → `server/db.ts` (репозитории с типами)
- Сложные агрегации (аналитика, KPI) → прямой `pool.query()` в контроллерах дашборда
- Транзакции (создание заказа с позициями) → `pool.connect()` + `BEGIN/COMMIT/ROLLBACK`
- Никогда не использовать конкатенацию строк в SQL — только параметризованные `$1, $2, ...`

---

## iiko-интеграция

### Как работает
1. `server/iiko/client.ts` — клиент iikoCloud OLAP. Если у ресторана нет `api_login` в `iiko_credentials` — автоматически переключается на `mock.ts`. Никогда не удалять mock-ветку.
2. `server/iiko/sync.ts` — `syncRestaurant(restaurantId)` синхронизирует 7 кэш-таблиц параллельно через `Promise.allSettled` (один упавший синк не блокирует остальные).
3. `server/cron/iiko-cron.ts` — каждые 15 минут запускает sync для всех ресторанов с `api_login`.
4. При старте сервера: `initMockSyncIfNeeded()` наполняет кэш демо-данными для ресторанов без iiko.

### Токен iiko
Кешируется в памяти процесса на 55 минут (`tokenCache` в client.ts). При горизонтальном масштабировании — нужен Redis.

### Поля без данных из iiko (текущие ограничения)
- `avg_cook_time` — iiko OLAP не возвращает, всегда 0 в real-режиме
- `tips_amount` — аналогично, всегда 0
- `profit` — считается как 35% от выручки (хардкод); реальный P&L нужно считать отдельно
- `food_cost_pct` — хардкод 30%; реальные данные нужно получать из отдельного отчёта iiko

---

## Критические правила — НЕЛЬЗЯ НАРУШАТЬ

### 1. ИЗОЛЯЦИЯ ТЕНАНТОВ
Это главный инвариант системы. Нарушение — утечка данных между ресторанами.

```sql
-- ПРАВИЛЬНО
SELECT * FROM orders WHERE restaurant_id = $1 AND id = $2

-- НЕПРАВИЛЬНО — никогда
SELECT * FROM orders WHERE id = $1
```

- Каждый репозиторный метод, работающий с данными тенанта, обязан принимать `restaurantId` параметром
- `req.restaurant_id` устанавливается middleware (`tenant.ts`) и является единственным доверенным источником
- Никогда не брать `restaurant_id` из тела запроса или query-параметров — только из `req.restaurant_id`
- `tables.setStatus(id, restaurantId, status)` — обязателен `restaurantId` даже во внутренних вызовах
- `findAllPublic()` — обязателен фильтр `WHERE archived_at IS NULL`

### 2. АУТЕНТИФИКАЦИЯ
- Роль — только из `req.user.role` (верифицированный JWT + перепроверка в БД)
- При каждом запросе к CRM `crmTenantAuth` делает `db.users.findById()` — это не лишняя нагрузка, это защита от мгновенной блокировки уволенного
- Сброс пароля: новый пароль передаётся клиенту **один раз** в ответе API и нигде не сохраняется в plaintext
- Invite-коды одноразовые: сразу после регистрации проставляется `used_at` и `used_by_user_id`
- JWT payload содержит: `{ id, email, role, restaurant_id, restaurant_name }`

### 3. ИДЕМПОТЕНТНОСТЬ ПЛАТЕЖЕЙ
Двойное списание — критическая ошибка. Защита двухуровневая:
- Уровень приложения: проверка `findByKey(idemp_key)` перед обработкой
- Уровень БД: `UNIQUE(transaction_key)` — даже при гонке потоков второй INSERT упадёт с конфликтом
- Никогда не убирать `ON CONFLICT DO NOTHING` из INSERT в `payment_transactions`
- Переход `payment_status`: только `pending → paid`. Откат невозможен.

### 4. ОВЕРБУКИНГ
- `POST /client/reservations` — проверяет коллизии в окне ±90 минут для того же стола в ту же дату
- Проверка выполняется на сервере (не только на фронтенде) — прямой API-вызов не должен её обойти
- Статус брони `cancelled` или `completed` → `dining_tables.current_status = 'free'` — обязательно обновить

### 5. ТРАНЗАКЦИИ ПРИ МУТИРУЮЩИХ ОПЕРАЦИЯХ
- Создание заказа (order + order_items) — обязательно в одной PostgreSQL-транзакции
- Если items упадут после INSERT order — у нас "призрак"-заказ без позиций
- Паттерн: `const client = await pool.connect()` → `BEGIN` → операции → `COMMIT` → `finally: client.release()`

### 6. SOFT-DELETE РЕСТОРАНОВ
- Архивация: `UPDATE restaurants SET archived_at = NOW()` — никогда `DELETE FROM restaurants`
- Блокировки перед архивацией: активные заказы (`order_status != 'delivered'`) и будущие брони
- `findByFounder()` по умолчанию возвращает только не-архивированные (`WHERE archived_at IS NULL`)
- `findAllPublic()` обязан фильтровать архивированные

### 7. БЕЗОПАСНОСТЬ
- Пароли: `scrypt` через Node crypto (`server/utils/password.ts`). Формат: `salt_hex:hash_hex`. Не bcrypt.
- Логи: чувствительные поля (password, password_hash, base64-изображения) — редактируются через `redactSensitiveFields()` в `server.ts`
- Rate limiting: `POST /auth/login` и `POST /crm/auth/login` — макс. 10 попыток за 15 минут с одного IP
- Системные роуты `/system/*` — только `super_admin`, защищены двойным middleware `[crmTenantAuth, requireRole(["super_admin"])]`

### 8. MOCK-ФОЛЛБЭК IIKO
- Никогда не удалять условие `if (!opts.apiLogin) return generateMock...()` в `client.ts`
- Демо-тенанты и новые рестораны без iiko зависят от mock — он показывает реалистичные данные
- `initMockSyncIfNeeded()` — вызывается при старте для всех ресторанов с пустым `analytics_cache`

---

## Как работать в этом проекте

**Перед добавлением нового роута:**
1. Определить тип аутентификации: `clientTenantAuth` (X-Restaurant-Key) или `crmTenantAuth` (JWT)
2. Добавить `requireRole([...])` с минимально необходимыми ролями
3. Убедиться, что все SQL-запросы фильтруются по `req.restaurant_id`
4. Зарегистрировать роут в `server/routes/api.ts`

**Перед добавлением новой страницы фронтенда:**
1. Добавить API-функцию в `frontend/lib/api.ts` (все запросы — только через этот файл)
2. Создать страницу в `frontend/app/dashboard/[name]/page.tsx`
3. Добавить пункт в `Sidebar.tsx` с `module: "name"`
4. Добавить `"name"` в `enabled_modules` по умолчанию в `dashboard.controller.ts`
5. Если страница только для определённых ролей — читать `role` из `localStorage("user")` и редиректить

**При работе с БД:**
- Простые операции → методы в `server/db.ts` (там уже есть типы и маппинг строк)
- Сложные агрегации → прямой `pool.query()` в контроллере, но всегда с `restaurant_id = $1`
- Мутации с несколькими таблицами → обязательно транзакция

**При ошибке в runtime:**
1. Прочитать полный стектрейс
2. Если ошибка в SQL — проверить параметризацию и наличие `restaurant_id` в WHERE
3. Если 403 в middleware — проверить роли в `requireRole([...])` и JWT payload
4. Исправить → зафиксировать в "Выученных уроках" ниже

---

## Структура файлов

```
server.ts                        # Entry point: CORS, логирование, роуты, cron, error middleware
server/
  db.ts                          # Все репозитории (CRUD по доменам) + seed + initDatabase()
  pgdb.ts                        # Синглтон pg.Pool (импортировать отсюда, не создавать новый)
  logs.ts                        # In-memory лог запросов (доступен через /system/logs)
  archive.ts                     # Финансовый экспорт по месяцам + ежедневная автоочистка
  routes/
    api.ts                       # ВСЕ роуты /api/v1/* (единственный файл регистрации роутов)
  controllers/
    auth.controller.ts           # login, register, me, switchRestaurant
    dashboard.controller.ts      # Аналитика, меню-статс, зал, KPI, отзывы, настройки, iiko
    reservation.controller.ts    # CRUD броней (client + CRM)
    order.controller.ts          # CRUD заказов + payment webhook
  middlewares/
    tenant.ts                    # clientTenantAuth, crmTenantAuth, requireRole + SecureRequest тип
  iiko/
    client.ts                    # iikoCloud OLAP клиент + mock-фоллбэк + кэш токена
    sync.ts                      # syncRestaurant() — наполняет 7 кэш-таблиц
    mock.ts                      # Генерация реалистичных демо-данных
  notifications/
    index.ts                     # NotificationService singleton, метод trigger() + кэш настроек
    templates.ts                 # Тексты сообщений на русском языке (по событиям брони)
    channels/
      whatsapp.ts                # Twilio WhatsApp REST API
      email.ts                   # Resend email API
      webhook.ts                 # Outgoing HTTP webhook для n8n/Zapier/Make
  cron/
    iiko-cron.ts                 # Запуск syncRestaurant каждые 15 мин для всех ресторанов
    reminder-cron.ts             # Напоминания о бронях каждые 5 мин (за N часов до визита)
  migrations/
    001_init.sql                 # Ядро: restaurants, users, orders, reservations, ...
    002_dashboard.sql            # Кэш: analytics, menu_stats, hall, staff_kpi, feedback, ...
    003_constraints.sql          # Ограничения: CHECK на current_status столов
    004_notifications.sql        # notification_settings + reservations.customer_email/reminder_sent
  utils/
    password.ts                  # hashPassword, verifyPassword (scrypt), generateRandomPassword
    asyncHandler.ts              # Обёртка async-роутов → передаёт ошибки в error middleware
  types/
    express.d.ts                 # Расширение Request: restaurant_id, user (SecureRequest)
frontend/                        # Next.js приложение (отдельный package.json и node_modules)
  app/
    login/page.tsx               # Страница входа
    dashboard/
      layout.tsx                 # Общий layout: проверка JWT, загрузка настроек бренда, Sidebar
      analytics/page.tsx         # Финансовая аналитика + графики
      menu/page.tsx              # Топ/аутсайдеры блюд + стоп-лист
      hall/page.tsx              # Статус столов (авто-обновление 30s)
      staff/page.tsx             # KPI официантов
      marketing/page.tsx         # Отзывы + пиковые часы
      settings/page.tsx          # iiko-интеграция + бренд
      reservations/page.tsx      # Управление бронями
      orders/page.tsx            # Кухонный экран (авто-обновление 30s)
      employees/page.tsx         # Управление персоналом
      menu-editor/page.tsx       # CRUD меню
  components/
    layout/Sidebar.tsx           # Навигация с переключателем ресторанов для founder
    cards/MetricCard.tsx         # Карточка метрики
    charts/                      # RevenueChart, PaymentPieChart, PeakHoursChart
  lib/
    api.ts                       # Все API-функции (единственная точка вызова бэкенда)
scripts/
  create-super-admin.ts          # Одноразовый скрипт создания super_admin
dist/                            # Вывод esbuild (в .gitignore)
```

---

## Цикл самосовершенствования

Каждая ошибка — это возможность сделать систему надёжнее. Правило простое:

1. Нашёл ошибку или пользователь указал на проблему
2. Исправил код
3. Убедился, что исправление работает
4. Записал в **"Выученные уроки"** ниже — одной строкой, суть + правило

Триггеры для записи:
- Пользователь говорит "нет", "неправильно", "не так", "не работает"
- Найдена логическая ошибка в запросе, роуте, трансформации данных
- Что-то не работало — причина найдена

Не объяснять. Не обосновывать. Просто факт + правило.

---

## Выученные уроки

- Демо-пользователи: формат `owner@tenant-a.io` / `password123`, не `founder_a@rest.com`
- Хэширование паролей: Node crypto scrypt (`salt:hash`), не bcrypt — не путать в документации и комментариях
- JWT payload не содержал `restaurant_name` → имя ресторана в сайдбаре всегда показывалось как "Мой Ресторан"; исправлено добавлением `restaurant_name` в payload при логине
- `findAllPublic()` возвращал архивированные рестораны — добавлен фильтр `WHERE archived_at IS NULL`
- `tables.setStatus()` не проверял `restaurant_id` — добавлен параметр и условие в WHERE
- Контроллеры `order.controller.ts` и `reservation.controller.ts` существовали, но не были подключены к роутеру в `api.ts` — вся клиентская часть API была недоступна
- Idempotency webhook: проверка через `findByKey` + отдельный INSERT создавала TOCTOU-гонку; исправлено добавлением `ON CONFLICT DO NOTHING` на уровне SQL
- `avg_rating` считался по последним 50 отзывам вместо всех; исправлено отдельным запросом `SELECT AVG(rating)`
- При создании заказа order и order_items создавались в отдельных запросах без транзакции — при падении items оставался "призрак"-заказ; обёрнуто в `BEGIN/COMMIT`
- Cron напоминаний: `r.time::time - CURRENT_TIME` падал с `operator does not exist: time without time zone - time with time zone` (CURRENT_TIME — это `timetz`); для арифметики со временем использовать `LOCALTIME` (тип `time`), не `CURRENT_TIME`
- Секреты уведомлений (`twilio_auth_token`, `resend_api_key`) НИКОГДА не отдаются в API целиком — только маска первых 4 символов (`*_masked`); пустой инпут на фронте не затирает сохранённый ключ (COALESCE в upsert)
