import { Router } from "express";
import { randomUUID } from "crypto";
import { login, me, register, switchRestaurant } from "../controllers/auth.controller";
import {
  clientCreateReservation,
  crmGetReservations,
  crmUpdateReservation,
} from "../controllers/reservation.controller";
import {
  clientCreateOrder,
  clientPaymentWebhook,
  crmGetOrders,
  crmUpdateOrderStatus,
} from "../controllers/order.controller";
import { clientTenantAuth, crmTenantAuth, requireRole, SecureRequest } from "../middlewares/tenant";
import { asyncHandler } from "../utils/asyncHandler";
import { generateRandomPassword, hashPassword } from "../utils/password";
import { db } from "../db";
import type { Role } from "../db";

const router = Router();

// Публично саморегистрируемые роли сотрудников — основателя (founder) среди них нет:
// founder-аккаунт создаётся только через POST /auth/register с кодом приглашения.
const STAFF_ROLES: Role[] = ["manager", "hostess", "chef"];

// Регистрация по одноразовому коду приглашения — создаёт founder-аккаунт + его первый
// ресторан как новый независимый tenant (свой api_key). См. controllers/auth.controller.ts.
router.post("/auth/register", asyncHandler(register));

// ── PUBLIC (no auth) — для любого внешнего сайта ресторана/каталога тенантов ──
router.get(
  "/public/restaurants",
  asyncHandler((_req, res) => {
    // Никогда не отдаём api_key здесь — только id/name, безопасно для публичного каталога.
    res.json({ restaurants: db.restaurants.findAllPublic() });
  })
);

// ── CLIENT (X-Restaurant-Key) — для произвольного клиентского сайта ресторана ──
router.get(
  "/client/restaurant",
  clientTenantAuth,
  asyncHandler((req: SecureRequest, res) => {
    const restaurant = db.restaurants.findById(req.restaurant_id!);
    if (!restaurant) {
      res.status(404).json({ error: "Restaurant not found." });
      return;
    }
    const menu = db.menuItems.findByRestaurant(req.restaurant_id!).filter((m) => m.is_available);

    // Если у основателя несколько заведений (сеть), отдаём список всех его активных
    // ресторанов — портал показывает переключатель локаций, чтобы гость не перепутал
    // заведение, в которое бронирует столик или заказывает блюда.
    const locations = restaurant.founder_id
      ? db.restaurants
          .findByFounder(restaurant.founder_id)
          .map((r) => ({ id: r.id, name: r.name, api_key: r.api_key }))
      : [{ id: restaurant.id, name: restaurant.name, api_key: restaurant.api_key }];

    res.json({ id: restaurant.id, name: restaurant.name, menu, restaurants: locations });
  })
);

router.get(
  "/client/tables",
  clientTenantAuth,
  asyncHandler((req: SecureRequest, res) => {
    // Только статус/вместимость/позиция стола — никогда PII резерваций других гостей.
    const tables = db.tables.findByRestaurant(req.restaurant_id!).map((t) => ({
      id: t.id,
      table_number: t.table_number,
      capacity: t.capacity,
      x_pos: t.x_pos,
      y_pos: t.y_pos,
      current_status: t.current_status,
    }));
    res.json({ tables });
  })
);

router.post("/client/reservations", clientTenantAuth, asyncHandler(clientCreateReservation));

// Возвращает занятые временные слоты для конкретного стола на дату.
// Клиент видит только ФАКТ занятости слота — никаких имён/телефонов других гостей (PII защита).
router.get(
  "/client/slots",
  clientTenantAuth,
  asyncHandler((req: SecureRequest, res) => {
    const { date, table_id } = req.query as { date?: string; table_id?: string };
    if (!date || !table_id) {
      res.status(400).json({ error: "Параметры date и table_id обязательны." });
      return;
    }
    // Проверяем что стол принадлежит этому ресторану
    const table = db.tables.findByIdAndRestaurant(table_id, req.restaurant_id!);
    if (!table) {
      res.status(404).json({ error: "Стол не найден." });
      return;
    }

    const SLOT_DURATION = 120; // минут — длительность одного бронирования
    const DAY_START = 10 * 60;  // 10:00
    const DAY_END   = 22 * 60;  // 22:00
    const STEP      = 30;        // шаг слотов в минутах

    // Активные брони на этот стол на выбранную дату
    const reservationsOnDate = db.reservations
      .findByTableAndDate(table_id, date)
      .filter((r) => r.status !== "cancelled");

    const bookedMinutes = reservationsOnDate.map((r) => {
      const [h, m] = r.time.split(":").map(Number);
      return h * 60 + m;
    });

    const slots: { time: string; available: boolean; reason?: string }[] = [];

    for (let mins = DAY_START; mins <= DAY_END - STEP; mins += STEP) {
      const h = String(Math.floor(mins / 60)).padStart(2, "0");
      const m = String(mins % 60).padStart(2, "0");
      const timeStr = `${h}:${m}`;

      const conflict = bookedMinutes.find((bm) => Math.abs(bm - mins) < SLOT_DURATION);
      if (conflict !== undefined) {
        const ch = String(Math.floor(conflict / 60)).padStart(2, "0");
        const cm = String(conflict % 60).padStart(2, "0");
        slots.push({ time: timeStr, available: false, reason: `Занят (бронь в ${ch}:${cm})` });
      } else {
        slots.push({ time: timeStr, available: true });
      }
    }

    res.json({ table_id, date, slots });
  })
);

router.post("/client/orders", clientTenantAuth, asyncHandler(clientCreateOrder));
router.post("/client/payments/webhook", asyncHandler(clientPaymentWebhook));

// Primary auth endpoints
router.post("/auth/login", asyncHandler(login));
router.get("/auth/me", crmTenantAuth, asyncHandler(me));

// CRM-namespaced aliases
router.post("/crm/auth/login", asyncHandler(login));
router.get("/crm/auth/me", crmTenantAuth, asyncHandler(me));

// Founder переключает "активный" ресторан (если владеет несколькими) — реиздаёт JWT.
router.post(
  "/crm/founder/switch-restaurant",
  crmTenantAuth,
  requireRole(["founder"]),
  asyncHandler(switchRestaurant)
);

// Бронирования: founder/manager — полный доступ, hostess — только бронирования, chef — не видит.
router.get(
  "/crm/reservations",
  crmTenantAuth,
  requireRole(["founder", "manager", "hostess"]),
  asyncHandler(crmGetReservations)
);
router.patch(
  "/crm/reservations/:id",
  crmTenantAuth,
  requireRole(["founder", "manager", "hostess"]),
  asyncHandler(crmUpdateReservation)
);

// Заказы/кухня: founder/manager — полный доступ, chef — только заказы, hostess — не видит.
router.get(
  "/crm/orders",
  crmTenantAuth,
  requireRole(["founder", "manager", "chef"]),
  asyncHandler(crmGetOrders)
);
router.patch(
  "/crm/orders/:id",
  crmTenantAuth,
  requireRole(["founder", "manager", "chef"]),
  asyncHandler(crmUpdateOrderStatus)
);

// ── EMPLOYEE MANAGEMENT (Founder + Manager, в рамках одного активного ресторана) ───────
router.get(
  "/crm/employees",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler((req: SecureRequest, res) => {
    const staff = db.users.findByRestaurant(req.restaurant_id!);
    res.json({ staff: staff.map(({ id, email, role }) => ({ id, email, role })) });
  })
);

router.post(
  "/crm/employees",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler((req: SecureRequest, res) => {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      res.status(400).json({ error: "Переданы не все обязательные параметры сотрудника: e-mail, пароль, роль." });
      return;
    }

    if (!STAFF_ROLES.includes(role)) {
      res.status(400).json({ error: "Некорректная роль сотрудника." });
      return;
    }

    if (db.users.findByEmail(email)) {
      res.status(409).json({ error: "Пользователь с таким e-mail адресом уже зачислен в штат." });
      return;
    }

    const newUser = db.users.create({
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
  asyncHandler((req: SecureRequest, res) => {
    const { id } = req.params;

    if (id === req.user!.id) {
      res.status(400).json({ error: "Невозможно удалить самого себя из штата." });
      return;
    }

    const target = db.users.findByIdAndRestaurant(id, req.restaurant_id!);
    if (!target) {
      res.status(404).json({ error: "Сотрудник не найден или принадлежит другому ресторану." });
      return;
    }
    if (target.role === "founder") {
      res.status(403).json({ error: "Аккаунт основателя ресторана нельзя удалить." });
      return;
    }

    db.users.delete(id, req.restaurant_id!);
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
  asyncHandler((req: SecureRequest, res) => {
    const { id } = req.params;

    const target = db.users.findByIdAndRestaurant(id, req.restaurant_id!);
    if (!target) {
      res.status(404).json({ error: "Сотрудник не найден или принадлежит другому ресторану." });
      return;
    }

    const newPassword = generateRandomPassword();
    db.users.resetPassword(id, req.restaurant_id!, hashPassword(newPassword));

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
  asyncHandler((req: SecureRequest, res) => {
    const tables = db.tables.findByRestaurant(req.restaurant_id!);
    res.json({ tables });
  })
);

router.post(
  "/crm/tables",
  crmTenantAuth,
  requireRole(["founder", "manager", "hostess"]),
  asyncHandler((req: SecureRequest, res) => {
    const { table_number, capacity, x_pos, y_pos } = req.body;
    if (!table_number || !capacity) {
      res.status(400).json({ error: "table_number и capacity обязательны." });
      return;
    }
    const exists = db.tables.findByRestaurantAndNumber(req.restaurant_id!, Number(table_number));
    if (exists) {
      res.status(409).json({ error: `Стол №${table_number} уже существует в этом ресторане.` });
      return;
    }
    const newTable = db.tables.create({
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
  asyncHandler((req: SecureRequest, res) => {
    const { id } = req.params;
    const { capacity, x_pos, y_pos, current_status } = req.body;
    const updated = db.tables.update(id, req.restaurant_id!, {
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
  asyncHandler((req: SecureRequest, res) => {
    const { id } = req.params;
    const removed = db.tables.delete(id, req.restaurant_id!);
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
  asyncHandler((req: SecureRequest, res) => {
    res.json({ menu: db.menuItems.findByRestaurant(req.restaurant_id!) });
  })
);

router.post(
  "/crm/menu",
  crmTenantAuth,
  requireRole(["founder", "manager"]),
  asyncHandler((req: SecureRequest, res) => {
    const { name, price, category, is_available, image_url, description, badge_label, badge_color } = req.body;
    if (!name || price === undefined) {
      res.status(400).json({ error: "name и price обязательны." });
      return;
    }
    const item = db.menuItems.create({
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
  asyncHandler((req: SecureRequest, res) => {
    const { id } = req.params;
    const { name, price, category, is_available, image_url, description, badge_label, badge_color } = req.body;
    const updated = db.menuItems.update(id, req.restaurant_id!, {
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
  asyncHandler((req: SecureRequest, res) => {
    const { id } = req.params;
    const removed = db.menuItems.delete(id, req.restaurant_id!);
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
  asyncHandler((_req, res) => {
    res.json({ restaurants: db.restaurants.findAll() });
  })
);

router.post(
  "/crm/restaurants",
  crmTenantAuth,
  requireRole(["super_admin"]),
  asyncHandler((req: SecureRequest, res) => {
    const { name, owner_email, owner_password } = req.body;
    if (!name || !owner_email || !owner_password) {
      res.status(400).json({ error: "name, owner_email и owner_password обязательны." });
      return;
    }
    if (db.users.findByEmail(owner_email)) {
      res.status(409).json({ error: "Пользователь с таким e-mail уже существует." });
      return;
    }

    const restaurantId = `rest_${randomUUID()}`;
    const apiKey = `api_${randomUUID()}`;
    const founderId = `usr_${randomUUID()}`;

    const newRestaurant = db.restaurants.create({ id: restaurantId, name, api_key: apiKey, founder_id: founderId });
    const newOwner = db.users.create({
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
  asyncHandler((req: SecureRequest, res) => {
    const list =
      req.user!.role === "super_admin" ? db.restaurants.findAll() : db.restaurants.findByFounder(req.user!.id, { includeArchived: true });
    res.json({ restaurants: list });
  })
);

router.post(
  "/crm/founder/restaurants",
  crmTenantAuth,
  requireRole(["founder"]),
  asyncHandler((req: SecureRequest, res) => {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: "name обязателен." });
      return;
    }
    // Каждый дополнительный ресторан — отдельный tenant со своим свежим api_key,
    // чтобы у двух заведений одного основателя никогда не пересекались данные.
    const newRestaurant = db.restaurants.create({
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
  asyncHandler((req: SecureRequest, res) => {
    const { id } = req.params;
    const restaurant = db.restaurants.findById(id);
    if (!restaurant || (req.user!.role !== "super_admin" && restaurant.founder_id !== req.user!.id)) {
      res.status(404).json({ error: "Ресторан не найден или не принадлежит вам." });
      return;
    }
    if (db.orders.hasActiveByRestaurant(id)) {
      res.status(409).json({ error: "Нельзя удалить ресторан: есть незавершённые заказы (order_status ≠ delivered)." });
      return;
    }
    if (db.reservations.hasFutureActiveByRestaurant(id)) {
      res.status(409).json({ error: "Нельзя удалить ресторан: есть будущие активные бронирования." });
      return;
    }
    const archived = db.restaurants.archive(id, restaurant.founder_id!);
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
  asyncHandler((_req, res) => {
    res.json({ invite_codes: db.inviteCodes.findAll() });
  })
);

router.post(
  "/crm/invite-codes",
  crmTenantAuth,
  requireRole(["super_admin"]),
  asyncHandler((req: SecureRequest, res) => {
    const { note } = req.body;
    const invite = db.inviteCodes.create({ note });
    res.status(201).json({ message: "Новый код приглашения создан.", invite_code: invite });
  })
);

export default router;
