import { Router, Response as ExpressResponse, NextFunction } from "express";
import { randomUUID } from "crypto";
import { login, me, register, switchRestaurant } from "../controllers/auth.controller";
import { clientTenantAuth, crmTenantAuth, requireRole, SecureRequest } from "../middlewares/tenant";
import { asyncHandler } from "../utils/asyncHandler";
import { generateRandomPassword, hashPassword } from "../utils/password";
import { db } from "../db";
import type { Role } from "../db";
import {
  getAnalytics,
  getMenuStats,
  getStopList,
  getHallStatus,
  getStaffKpi,
  getPeakHours,
  getFeedback,
  getRestaurantSettings,
  updateRestaurantSettings,
  getIikoStatus,
  saveIikoCredentials,
  triggerManualSync,
  addGuestFeedback,
} from "../controllers/dashboard.controller";
import {
  clientCreateReservation,
  crmCreateReservation,
  crmGetReservations,
  crmUpdateReservation,
} from "../controllers/reservation.controller";
import {
  clientCreateOrder,
  clientPaymentWebhook,
  crmGetOrders,
  crmUpdateOrderStatus,
} from "../controllers/order.controller";
import { crmGetFinanceMonths, crmExportFinanceMonth } from "../archive";
import { notificationService, type NotificationSettings } from "../notifications/index.js";
import { sendWhatsApp } from "../notifications/channels/whatsapp.js";
import { sendEmail } from "../notifications/channels/email.js";
import { sendWebhook } from "../notifications/channels/webhook.js";
import { pool } from "../pgdb.js";

const router = Router();

/** Маскировка секрета для ответа API: первые 4 символа + "****". null остаётся null. */
function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 4) + "****";
}

// ── In-memory rate limiter для /auth/login ──────────────────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 минут

function rateLimitLogin(req: SecureRequest, res: ExpressResponse, next: NextFunction) {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT_MAX) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.status(429).json({
        error: `Слишком много попыток входа. Попробуйте через ${Math.ceil(retryAfterSec / 60)} мин.`,
      });
      return;
    }
    entry.count += 1;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }
  next();
}

// Роли разрешённые для регистрации сотрудников (не основатель — только через invite code).
const STAFF_ROLES: Role[] = ["manager", "hostess", "chef"];

// ── CLIENT: публичные эндпоинты с X-Restaurant-Key ───────────────────────────
router.post("/client/reservations", clientTenantAuth, asyncHandler(clientCreateReservation));
router.post("/client/orders", clientTenantAuth, asyncHandler(clientCreateOrder));
router.post("/client/payments/webhook", clientTenantAuth, asyncHandler(clientPaymentWebhook));

// ── CRM: бронирования ─────────────────────────────────────────────────────────
router.post("/crm/reservations", crmTenantAuth, requireRole(["founder", "manager", "hostess"]), asyncHandler(crmCreateReservation));
router.get("/crm/reservations", crmTenantAuth, requireRole(["founder", "manager", "hostess"]), asyncHandler(crmGetReservations));
router.patch("/crm/reservations/:id", crmTenantAuth, requireRole(["founder", "manager", "hostess"]), asyncHandler(crmUpdateReservation));

// ── CRM: заказы ───────────────────────────────────────────────────────────────
router.get("/crm/orders", crmTenantAuth, requireRole(["founder", "manager", "chef"]), asyncHandler(crmGetOrders));
router.patch("/crm/orders/:id", crmTenantAuth, requireRole(["founder", "manager", "chef"]), asyncHandler(crmUpdateOrderStatus));

// ── CRM: финансы / архив ──────────────────────────────────────────────────────
router.get("/crm/finance/months", crmTenantAuth, requireRole(["founder", "manager"]), asyncHandler(crmGetFinanceMonths));
router.get("/crm/finance/export", crmTenantAuth, requireRole(["founder", "manager"]), asyncHandler(crmExportFinanceMonth));

// Регистрация по одноразовому коду приглашения — создаёт founder-аккаунт + ресторан.
router.post("/auth/register", asyncHandler(register));

// ── PUBLIC: каталог ресторанов (без api_key) ──
router.get(
  "/public/restaurants",
  asyncHandler(async (_req, res) => {
    res.json({ restaurants: await db.restaurants.findAllPublic() });
  })
);

// Auth endpoints
router.post("/auth/login", rateLimitLogin, asyncHandler(login));
router.get("/auth/me", crmTenantAuth, asyncHandler(me));

// CRM-namespaced auth aliases
router.post("/crm/auth/login", rateLimitLogin, asyncHandler(login));
router.get("/crm/auth/me", crmTenantAuth, asyncHandler(me));

// Founder переключает "активный" ресторан — реиздаёт JWT.
router.post(
  "/crm/founder/switch-restaurant",
  crmTenantAuth,
  requireRole(["founder"]),
  asyncHandler(switchRestaurant)
);

// ── DASHBOARD: Аналитика и Финансы ────────────────────────────────────────────
router.get("/crm/dashboard/analytics", crmTenantAuth, requireRole(["founder", "manager"]), getAnalytics);
router.get("/crm/dashboard/menu-stats", crmTenantAuth, requireRole(["founder", "manager", "chef"]), getMenuStats);
router.get("/crm/dashboard/stop-list", crmTenantAuth, requireRole(["founder", "manager", "chef"]), getStopList);
router.get("/crm/dashboard/hall", crmTenantAuth, requireRole(["founder", "manager", "hostess"]), getHallStatus);
router.get("/crm/dashboard/staff-kpi", crmTenantAuth, requireRole(["founder", "manager"]), getStaffKpi);
router.get("/crm/dashboard/peak-hours", crmTenantAuth, requireRole(["founder", "manager"]), getPeakHours);
router.get("/crm/dashboard/feedback", crmTenantAuth, requireRole(["founder", "manager"]), getFeedback);
router.post("/crm/dashboard/feedback", crmTenantAuth, requireRole(["founder", "manager"]), addGuestFeedback);

// ── НАСТРОЙКИ РЕСТОРАНА (бренд + enabled_modules) ─────────────────────────────
router.get("/crm/restaurant/settings", crmTenantAuth, requireRole(["founder", "manager"]), getRestaurantSettings);
router.patch("/crm/restaurant/settings", crmTenantAuth, requireRole(["founder"]), updateRestaurantSettings);

// ── iiko ИНТЕГРАЦИЯ ───────────────────────────────────────────────────────────
router.get("/crm/iiko/status", crmTenantAuth, requireRole(["founder", "manager"]), getIikoStatus);
router.post("/crm/iiko/credentials", crmTenantAuth, requireRole(["founder"]), saveIikoCredentials);
router.post("/crm/iiko/sync", crmTenantAuth, requireRole(["founder", "manager"]), triggerManualSync);

// ── УВЕДОМЛЕНИЯ (WhatsApp / Email / Webhook) ──────────────────────────────────
// Чтение настроек доступно founder+manager, но секреты (auth token, resend key) НИКОГДА
// не отдаются целиком — только маска первых 4 символов. Запись (включая ключи) — только founder.
router.get(
  "/crm/notifications/settings",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM notification_settings WHERE restaurant_id = $1",
      [req.restaurant_id]
    );
    const row = rows[0];

    if (!row) {
      // Дефолты для ресторана, который ещё ни разу не сохранял настройки.
      res.json({
        whatsapp_enabled: false,
        email_enabled: false,
        webhook_url: null,
        reminder_hours: 2,
        twilio_account_sid: null,
        twilio_auth_token_masked: null,
        twilio_from: null,
        resend_api_key_masked: null,
      });
      return;
    }

    res.json({
      whatsapp_enabled: row.whatsapp_enabled,
      email_enabled: row.email_enabled,
      webhook_url: row.webhook_url,
      reminder_hours: row.reminder_hours,
      twilio_account_sid: row.twilio_account_sid,
      twilio_auth_token_masked: maskSecret(row.twilio_auth_token),
      twilio_from: row.twilio_from,
      resend_api_key_masked: maskSecret(row.resend_api_key),
    });
  })
);

router.post(
  "/crm/notifications/settings",
  crmTenantAuth,
  requireRole(["founder"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const {
      whatsapp_enabled,
      email_enabled,
      webhook_url,
      reminder_hours,
      twilio_account_sid,
      twilio_auth_token,
      twilio_from,
      resend_api_key,
    } = req.body;

    // Upsert: незаданные (undefined→null) поля при обновлении сохраняют прежнее значение через COALESCE.
    // NOT NULL колонки (whatsapp_enabled/email_enabled/reminder_hours) при первом INSERT получают
    // дефолт через COALESCE в VALUES — иначе явный NULL нарушил бы ограничение NOT NULL.
    await pool.query(
      `INSERT INTO notification_settings
        (restaurant_id, whatsapp_enabled, email_enabled, webhook_url, reminder_hours,
         twilio_account_sid, twilio_auth_token, twilio_from, resend_api_key)
       VALUES ($1, COALESCE($2, false), COALESCE($3, false), $4, COALESCE($5, 2), $6, $7, $8, $9)
       ON CONFLICT (restaurant_id) DO UPDATE SET
         whatsapp_enabled   = COALESCE($2, notification_settings.whatsapp_enabled),
         email_enabled      = COALESCE($3, notification_settings.email_enabled),
         webhook_url        = COALESCE($4, notification_settings.webhook_url),
         reminder_hours     = COALESCE($5, notification_settings.reminder_hours),
         twilio_account_sid = COALESCE($6, notification_settings.twilio_account_sid),
         twilio_auth_token  = COALESCE($7, notification_settings.twilio_auth_token),
         twilio_from        = COALESCE($8, notification_settings.twilio_from),
         resend_api_key     = COALESCE($9, notification_settings.resend_api_key)`,
      [
        req.restaurant_id,
        whatsapp_enabled ?? null,
        email_enabled ?? null,
        webhook_url ?? null,
        reminder_hours ?? null,
        twilio_account_sid ?? null,
        twilio_auth_token ?? null,
        twilio_from ?? null,
        resend_api_key ?? null,
      ]
    );

    notificationService.invalidateCache(req.restaurant_id!);
    res.json({ message: "Настройки уведомлений сохранены." });
  })
);

router.post(
  "/crm/notifications/test",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { channel, target } = req.body as { channel?: string; target?: string };

    const { rows } = await pool.query(
      "SELECT * FROM notification_settings WHERE restaurant_id = $1",
      [req.restaurant_id]
    );
    // Даже без сохранённой строки тест должен работать на глобальных env-ключах,
    // поэтому подставляем безопасный объект-дефолт вместо null.
    const settings: NotificationSettings = (rows[0] as NotificationSettings) ?? {
      restaurant_id: req.restaurant_id!,
      whatsapp_enabled: false,
      email_enabled: false,
      webhook_url: null,
      reminder_hours: 2,
      twilio_account_sid: null,
      twilio_auth_token: null,
      twilio_from: null,
      resend_api_key: null,
    };

    try {
      if (channel === "whatsapp") {
        await sendWhatsApp(target || "whatsapp:+70000000000", "🧪 Тест уведомлений. Всё работает!", settings);
      } else if (channel === "email") {
        if (!target) {
          res.json({ success: false, error: "Для теста email укажите адрес получателя." });
          return;
        }
        await sendEmail(target, "Тест уведомлений", "🧪 Тест уведомлений. Всё работает!", settings);
      } else if (channel === "webhook") {
        const url = target || settings.webhook_url;
        if (!url) {
          res.json({ success: false, error: "Webhook URL не задан." });
          return;
        }
        await sendWebhook("test", { message: "Test webhook from Restaurant Dashboard" }, url);
      } else {
        res.status(400).json({ success: false, error: "Неизвестный канал." });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  })
);

// ── EMPLOYEE MANAGEMENT (Founder + Manager, в рамках одного активного ресторана) ───────
router.get(
  "/crm/employees",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const staff = await db.users.findByRestaurant(req.restaurant_id!);
    res.json({ staff: staff.map(({ id, email, role }) => ({ id, email, role })) });
  })
);

router.post(
  "/crm/employees",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      res.status(400).json({ error: "Переданы не все обязательные параметры сотрудника: e-mail, пароль, роль." });
      return;
    }

    if (!STAFF_ROLES.includes(role)) {
      res.status(400).json({ error: "Некорректная роль сотрудника." });
      return;
    }

    if (await db.users.findByEmail(email)) {
      res.status(409).json({ error: "Пользователь с таким e-mail адресом уже зачислен в штат." });
      return;
    }

    const newUser = await db.users.create({
      restaurant_id: req.restaurant_id!,
      email,
      password_hash: hashPassword(password),
      role: role as Role,
    });

    res.status(201).json({
      message: "Сотрудник зачислен в штат ресторана.",
      user: { id: newUser.id, email: newUser.email, role: newUser.role },
    });
  })
);

router.delete(
  "/crm/employees/:id",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { id } = req.params;

    if (id === req.user!.id) {
      res.status(400).json({ error: "Невозможно удалить самого себя из штата." });
      return;
    }

    const target = await db.users.findByIdAndRestaurant(id, req.restaurant_id!);
    if (!target) {
      res.status(404).json({ error: "Сотрудник не найден или принадлежит другому ресторану." });
      return;
    }
    if (target.role === "founder") {
      res.status(403).json({ error: "Аккаунт основателя ресторана нельзя удалить." });
      return;
    }

    await db.users.delete(id, req.restaurant_id!);
    res.json({ message: `Сотрудник ${target.email} удалён из штата ресторана.` });
  })
);

// Сброс пароля сотрудника, если он его забыл: новый пароль генерируется на сервере,
// хэшируется и сохраняется, а гостю (founder/manager) он отдаётся открытым текстом
// ровно один раз в ответе — повторно посмотреть его будет невозможно.
router.post(
  "/crm/employees/:id/reset-password",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { id } = req.params;

    const target = await db.users.findByIdAndRestaurant(id, req.restaurant_id!);
    if (!target) {
      res.status(404).json({ error: "Сотрудник не найден или принадлежит другому ресторану." });
      return;
    }

    const newPassword = generateRandomPassword();
    await db.users.resetPassword(id, req.restaurant_id!, hashPassword(newPassword));

    res.json({
      message: `Новый пароль для ${target.email} сгенерирован.`,
      email: target.email,
      new_password: newPassword,
    });
  })
);

// ── TABLE MANAGEMENT ─────────────────────────────────────────────────────────
router.get(
  "/crm/tables",
  crmTenantAuth,
  requireRole(["founder", "manager", "hostess", "chef"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const tables = await db.tables.findByRestaurant(req.restaurant_id!);
    res.json({ tables });
  })
);

router.post(
  "/crm/tables",
  crmTenantAuth,
  requireRole(["founder", "manager", "hostess"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { table_number, capacity, x_pos, y_pos } = req.body;
    if (!table_number || !capacity) {
      res.status(400).json({ error: "table_number и capacity обязательны." });
      return;
    }
    const exists = await db.tables.findByRestaurantAndNumber(req.restaurant_id!, Number(table_number));
    if (exists) {
      res.status(409).json({ error: `Стол №${table_number} уже существует в этом ресторане.` });
      return;
    }
    const newTable = await db.tables.create({
      restaurant_id: req.restaurant_id!,
      table_number: Number(table_number),
      capacity: Number(capacity),
      x_pos: Number(x_pos) || 50,
      y_pos: Number(y_pos) || 50,
      current_status: "free",
    });
    res.status(201).json({ message: "Стол добавлен на карту зала.", table: newTable });
  })
);

router.patch(
  "/crm/tables/:id",
  crmTenantAuth,
  requireRole(["founder", "manager", "hostess"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { id } = req.params;
    const { capacity, x_pos, y_pos, current_status } = req.body;
    if (current_status !== undefined && !["free", "reserved", "occupied"].includes(current_status)) {
      res.status(400).json({ error: "current_status должен быть: free, reserved, occupied" });
      return;
    }
    const updated = await db.tables.update(id, req.restaurant_id!, {
      ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
      ...(x_pos !== undefined ? { x_pos: Number(x_pos) } : {}),
      ...(y_pos !== undefined ? { y_pos: Number(y_pos) } : {}),
      ...(current_status !== undefined ? { current_status } : {}),
    });
    if (!updated) {
      res.status(404).json({ error: "Стол не найден или принадлежит другому ресторану." });
      return;
    }
    res.json({ message: "Стол обновлён.", table: updated });
  })
);

router.delete(
  "/crm/tables/:id",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { id } = req.params;
    const removed = await db.tables.delete(id, req.restaurant_id!);
    if (!removed) {
      res.status(404).json({ error: "Стол не найден или принадлежит другому ресторану." });
      return;
    }
    res.json({ message: `Стол №${removed.table_number} удалён с карты зала.` });
  })
);

// ── MENU MANAGEMENT (Founder + Manager управляют; чтение доступно всем ролям) ──────
router.get(
  "/crm/menu",
  crmTenantAuth,
  requireRole(["founder", "manager", "hostess", "chef"]),
  asyncHandler(async (req: SecureRequest, res) => {
    res.json({ menu: await db.menuItems.findByRestaurant(req.restaurant_id!) });
  })
);

router.post(
  "/crm/menu",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { name, price, category, is_available, image_url, description, badge_label, badge_color } = req.body;
    if (!name || price === undefined) {
      res.status(400).json({ error: "name и price обязательны." });
      return;
    }
    const item = await db.menuItems.create({
      restaurant_id: req.restaurant_id!,
      name,
      price: Number(price),
      category,
      is_available: is_available !== undefined ? Boolean(is_available) : true,
      image_url,
      description,
      badge_label,
      badge_color,
    });
    res.status(201).json({ message: "Блюдо добавлено в меню.", item });
  })
);

router.patch(
  "/crm/menu/:id",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { id } = req.params;
    const { name, price, category, is_available, image_url, description, badge_label, badge_color } = req.body;
    const updated = await db.menuItems.update(id, req.restaurant_id!, {
      ...(name !== undefined ? { name } : {}),
      ...(price !== undefined ? { price: Number(price) } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(is_available !== undefined ? { is_available: Boolean(is_available) } : {}),
      ...(image_url !== undefined ? { image_url } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(badge_label !== undefined ? { badge_label } : {}),
      ...(badge_color !== undefined ? { badge_color } : {}),
    });
    if (!updated) {
      res.status(404).json({ error: "Блюдо не найдено или принадлежит другому ресторану." });
      return;
    }
    res.json({ message: "Блюдо обновлено.", item: updated });
  })
);

router.delete(
  "/crm/menu/:id",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { id } = req.params;
    const removed = await db.menuItems.delete(id, req.restaurant_id!);
    if (!removed) {
      res.status(404).json({ error: "Блюдо не найдено или принадлежит другому ресторану." });
      return;
    }
    res.json({ message: `«${removed.name}» удалено из меню.` });
  })
);

// ── RESTAURANT MANAGEMENT (Super Admin — глобальный реестр всех tenant'ов) ──────────
router.get(
  "/crm/restaurants",
  crmTenantAuth,
  requireRole(["super_admin"]),
  asyncHandler(async (_req, res) => {
    res.json({ restaurants: await db.restaurants.findAll() });
  })
);

router.post(
  "/crm/restaurants",
  crmTenantAuth,
  requireRole(["super_admin"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { name, owner_email, owner_password } = req.body;
    if (!name || !owner_email || !owner_password) {
      res.status(400).json({ error: "name, owner_email и owner_password обязательны." });
      return;
    }
    if (await db.users.findByEmail(owner_email)) {
      res.status(409).json({ error: "Пользователь с таким e-mail уже существует." });
      return;
    }

    const restaurantId = `rest_${randomUUID()}`;
    const apiKey = `api_${randomUUID()}`;
    const founderId = `usr_${randomUUID()}`;

    const newRestaurant = await db.restaurants.create({ id: restaurantId, name, api_key: apiKey, founder_id: founderId });
    const newOwner = await db.users.create({
      id: founderId,
      restaurant_id: restaurantId,
      email: owner_email,
      password_hash: hashPassword(owner_password),
      role: "founder",
    });

    res.status(201).json({
      message: `Ресторан «${name}» зарегистрирован в SaaS системе.`,
      restaurant: newRestaurant,
      owner: { id: newOwner.id, email: newOwner.email, role: newOwner.role },
    });
  })
);

// ── FOUNDER SELF-SERVICE: несколько ресторанов под одним основателем ───────────────
router.get(
  "/crm/founder/restaurants",
  crmTenantAuth,
  requireRole(["founder"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const list =
      req.user!.role === "super_admin"
        ? await db.restaurants.findAll()
        : await db.restaurants.findByFounder(req.user!.id, { includeArchived: true });
    res.json({ restaurants: list });
  })
);

router.post(
  "/crm/founder/restaurants",
  crmTenantAuth,
  requireRole(["founder"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: "name обязателен." });
      return;
    }
    // Каждый дополнительный ресторан — отдельный tenant со своим свежим api_key,
    // чтобы у двух заведений одного основателя никогда не пересекались данные.
    const newRestaurant = await db.restaurants.create({
      name,
      api_key: `api_${randomUUID()}`,
      founder_id: req.user!.id,
    });
    res.status(201).json({
      message: `Ресторан «${name}» добавлен в ваш список ресторанов. Переключитесь на него через /crm/founder/switch-restaurant.`,
      restaurant: newRestaurant,
    });
  })
);

router.delete(
  "/crm/founder/restaurants/:id",
  crmTenantAuth,
  requireRole(["founder"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { id } = req.params;
    const restaurant = await db.restaurants.findById(id);
    if (!restaurant || (req.user!.role !== "super_admin" && restaurant.founder_id !== req.user!.id)) {
      res.status(404).json({ error: "Ресторан не найден или не принадлежит вам." });
      return;
    }
    if (await db.orders.hasActiveByRestaurant(id)) {
      res.status(409).json({ error: "Нельзя удалить ресторан: есть незавершённые заказы (order_status ≠ delivered)." });
      return;
    }
    if (await db.reservations.hasFutureActiveByRestaurant(id)) {
      res.status(409).json({ error: "Нельзя удалить ресторан: есть будущие активные бронирования." });
      return;
    }
    const archived = await db.restaurants.archive(id, restaurant.founder_id!);
    if (!archived) {
      res.status(409).json({ error: "Ресторан уже архивирован." });
      return;
    }
    res.json({ message: `Ресторан «${archived.name}» архивирован.`, restaurant: archived });
  })
);

// ── INVITE CODES (Super Admin генерирует одноразовые коды для регистрации founder'ов) ─
router.get(
  "/crm/invite-codes",
  crmTenantAuth,
  requireRole(["super_admin"]),
  asyncHandler(async (_req, res) => {
    res.json({ invite_codes: await db.inviteCodes.findAll() });
  })
);

router.post(
  "/crm/invite-codes",
  crmTenantAuth,
  requireRole(["super_admin"]),
  asyncHandler(async (req: SecureRequest, res) => {
    const { note } = req.body;
    const invite = await db.inviteCodes.create({ note });
    res.status(201).json({ message: "Новый код приглашения создан.", invite_code: invite });
  })
);

export default router;
