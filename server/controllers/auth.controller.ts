import { Response } from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db } from "../db";
import { JWT_SECRET, SecureRequest } from "../middlewares/tenant";
import { hashPassword, verifyPassword } from "../utils/password";

/**
 * Handles CRM employee authentication and issues JWT.
 * Для founder'а (может владеть несколькими ресторанами) JWT получает "активный" restaurant_id —
 * по умолчанию первый созданный ресторан; переключение — через POST /crm/founder/switch-restaurant.
 */
export function login(req: SecureRequest, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const user = db.users.findByEmail(email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  let restaurantName = "SaaS System Management";
  let activeRestaurantId = user.restaurant_id;
  let ownedRestaurants: { id: string; name: string; api_key: string }[] | undefined;

  if (user.role === "founder") {
    const owned = db.restaurants.findByFounder(user.id);
    if (owned.length === 0) {
      res.status(500).json({ error: "Database state error: founder без единого ресторана." });
      return;
    }
    activeRestaurantId = owned[0].id;
    restaurantName = owned[0].name;
    ownedRestaurants = owned.map((r) => ({ id: r.id, name: r.name, api_key: r.api_key }));
  } else if (user.restaurant_id !== "system") {
    const restaurant = db.restaurants.findById(user.restaurant_id);
    if (!restaurant) {
      res.status(500).json({ error: "Database state error: Restaurant not found for user" });
      return;
    }
    if (restaurant.archived_at) {
      res.status(403).json({ error: "Этот ресторан архивирован. Обратитесь к основателю ресторана." });
      return;
    }
    restaurantName = restaurant.name;
  }

  // Issue fully scoped JWT containing tenant identifier and employee roles
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      restaurant_id: activeRestaurantId,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      restaurant_name: restaurantName,
      restaurant_id: activeRestaurantId,
      ...(ownedRestaurants ? { restaurants: ownedRestaurants } : {}),
    },
  });
}

/**
 * Публичная регистрация — создаёт ТОЛЬКО founder-аккаунт вместе с его первым рестораном
 * (новый независимый tenant со своим api_key). Менеджеров/шефов/хостес добавляет сам
 * founder изнутри CRM (POST /crm/employees) — это не публичный путь.
 *
 * Защищено одноразовым кодом приглашения (founder_invite_codes): код выдаёт лично
 * super_admin каждому клиенту, чтобы CRM не мог бесплатно подключить кто угодно.
 */
export function register(req: SecureRequest, res: Response) {
  const { restaurant_name, email, password, invite_code } = req.body;

  if (!restaurant_name || !email || !password || !invite_code) {
    res
      .status(400)
      .json({ error: "Укажите название ресторана, e-mail, пароль основателя и код приглашения." });
    return;
  }

  if (String(password).length < 8) {
    res.status(400).json({ error: "Пароль должен содержать не менее 8 символов." });
    return;
  }

  const invite = db.inviteCodes.findByCode(invite_code);
  if (!invite) {
    res.status(403).json({ error: "Код приглашения не найден. Запросите персональный код у поставщика CRM." });
    return;
  }
  if (invite.used_at) {
    res.status(403).json({ error: "Этот код приглашения уже использован — каждый код одноразовый." });
    return;
  }

  if (db.users.findByEmail(email)) {
    res.status(409).json({ error: "Пользователь с таким e-mail уже зарегистрирован." });
    return;
  }

  const founderId = `usr_${randomUUID()}`;
  const restaurant = db.restaurants.create({
    name: restaurant_name,
    api_key: `api_${randomUUID()}`,
    founder_id: founderId,
  });
  const founder = db.users.create({
    id: founderId,
    restaurant_id: restaurant.id,
    email,
    password_hash: hashPassword(password),
    role: "founder",
  });

  db.inviteCodes.markUsed(invite.code, founder.id);

  const token = jwt.sign(
    { id: founder.id, email: founder.email, role: founder.role, restaurant_id: restaurant.id },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.status(201).json({
    message: `Ресторан «${restaurant.name}» зарегистрирован как новое независимое заведение. Добро пожаловать.`,
    token,
    user: {
      id: founder.id,
      email: founder.email,
      role: founder.role,
      restaurant_name: restaurant.name,
      restaurant_id: restaurant.id,
      restaurants: [{ id: restaurant.id, name: restaurant.name, api_key: restaurant.api_key }],
    },
  });
}

/**
 * Founder переключает "активный" ресторан (если владеет несколькими) — переиздаёт JWT
 * с новым restaurant_id. super_admin может переключиться в любой ресторан для диагностики.
 */
export function switchRestaurant(req: SecureRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const { restaurant_id } = req.body;
  if (!restaurant_id) {
    res.status(400).json({ error: "restaurant_id обязателен." });
    return;
  }

  if (req.user.role !== "founder" && req.user.role !== "super_admin") {
    res.status(403).json({ error: "Переключение между ресторанами доступно только основателю." });
    return;
  }

  const restaurant = db.restaurants.findById(restaurant_id);
  if (!restaurant || restaurant.archived_at) {
    res.status(404).json({ error: "Ресторан не найден или архивирован." });
    return;
  }

  if (req.user.role === "founder" && restaurant.founder_id !== req.user.id) {
    res.status(403).json({ error: "Этот ресторан не принадлежит вам." });
    return;
  }

  const token = jwt.sign(
    { id: req.user.id, email: req.user.email, role: req.user.role, restaurant_id: restaurant.id },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({
    message: `Активный ресторан переключён на «${restaurant.name}».`,
    token,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      restaurant_name: restaurant.name,
      restaurant_id: restaurant.id,
    },
  });
}

/**
 * Retrieve current user profile based on JWT verification.
 */
export function me(req: SecureRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized: Staff context required" });
    return;
  }

  const restaurant = db.restaurants.findById(req.user.restaurant_id);

  res.json({
    user: req.user,
    restaurant_name: restaurant?.name || "Unknown Restaurant",
  });
}
