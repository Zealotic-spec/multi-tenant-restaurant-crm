import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { db } from "../db";
import type { Role } from "../db";

/**
 * В production JWT_SECRET обязателен и берётся только из окружения — без него
 * процесс не запускается (fail-fast при деплое, а не тихая дырка в безопасности).
 * В dev/без NODE_ENV=production генерируем случайный секрет на старте процесса:
 * это безопасно для локальной разработки, но все токены аннулируются при перезапуске.
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET не задан (или короче 16 символов). Задайте переменную окружения JWT_SECRET перед запуском в production."
    );
  }

  console.warn(
    "[SECURITY WARNING] JWT_SECRET не задан в .env — используется случайный временный секрет процесса. " +
      "Все выданные JWT аннулируются при перезапуске сервера. Установите JWT_SECRET в .env для стабильной работы."
  );
  return randomBytes(32).toString("hex");
}

export const JWT_SECRET = resolveJwtSecret();

export interface SecureRequest extends Omit<Request, "user"> {
  restaurant_id?: string;
  user?: {
    id: string;
    email: string;
    role: Role;
    restaurant_id: string;
  };
}

export function clientTenantAuth(req: SecureRequest, res: Response, next: NextFunction) {
  const apiKey = req.header("X-Restaurant-Key");

  if (!apiKey) {
    res.status(401).json({ error: "Missing X-Restaurant-Key header." });
    return;
  }

  const restaurant = db.restaurants.findByApiKey(apiKey);

  if (!restaurant) {
    res.status(401).json({ error: "Invalid or unknown X-Restaurant-Key." });
    return;
  }

  req.restaurant_id = restaurant.id;
  next();
}

export function crmTenantAuth(req: SecureRequest, res: Response, next: NextFunction) {
  const authHeader = req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Bearer token in Authorization header." });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: Role;
      restaurant_id: string;
    };

    const userRecord = db.users.findById(decoded.id);

    // Роль в БД могла измениться (или сотрудника уволили) после выдачи токена — не доверяем
    // одному лишь содержимому JWT, перепроверяем текущее состояние записи в users.
    if (!userRecord || userRecord.role !== decoded.role) {
      res.status(403).json({ error: "Access denied: user not found or role changed since token issuance." });
      return;
    }

    if (decoded.role === "super_admin") {
      req.user = decoded;
      req.restaurant_id = decoded.restaurant_id;
      next();
      return;
    }

    if (decoded.role === "founder") {
      // founder не привязан к одному restaurant_id — он может владеть несколькими ресторанами.
      // restaurant_id в токене — это "активный" ресторан (см. /crm/founder/switch-restaurant),
      // владение проверяется через restaurants.founder_id, а не через users.restaurant_id.
      const restaurant = db.restaurants.findById(decoded.restaurant_id);
      const owns = !!restaurant && restaurant.founder_id === userRecord.id && !restaurant.archived_at;
      if (!owns) {
        res.status(403).json({
          error: "Access denied: ресторан не найден, архивирован или не принадлежит этому основателю.",
        });
        return;
      }
      req.user = decoded;
      req.restaurant_id = decoded.restaurant_id;
      next();
      return;
    }

    // manager / hostess / chef — жёстко привязаны к одному ресторану через users.restaurant_id.
    if (userRecord.restaurant_id !== decoded.restaurant_id) {
      res.status(403).json({ error: "Access denied: user not found or tenant mismatch." });
      return;
    }
    const restaurant = db.restaurants.findById(decoded.restaurant_id);
    if (!restaurant || restaurant.archived_at) {
      res.status(403).json({ error: "Access denied: ресторан архивирован или не найден." });
      return;
    }

    req.user = decoded;
    req.restaurant_id = decoded.restaurant_id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired JWT token." });
  }
}

export function requireRole(allowedRoles: Role[]) {
  return (req: SecureRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    if (req.user.role === "super_admin") return next();

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Role '${req.user.role}' is not permitted. Required: [${allowedRoles.join(", ")}].`,
      });
      return;
    }

    next();
  };
}
