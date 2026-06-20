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
import { hashPassword } from "../utils/password";
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
    res.json({ id: restaurant.id, name: restaurant.name, menu });
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
      message: "Сотрудник зачислен в штат организации.",
      user: { id: newUser.id, email: newUser.email, role: newUser.role },
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
    const { name, price, category, is_available } = req.body;
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
    const { name, price, category, is_available } = req.body;
    const updated = db.menuItems.update(id, req.restaurant_id!, {
      ...(name !== undefined ? { name } : {}),
      ...(price !== undefined ? { price: Number(price) } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(is_available !== undefined ? { is_available: Boolean(is_available) } : {}),
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
      message: `Ресторан «${name}» добавлен в вашу организацию. Переключитесь на него через /crm/founder/switch-restaurant.`,
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
      res.status(404).json({ error: "Ресторан не найден или не принадлежит вашей организации." });
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
