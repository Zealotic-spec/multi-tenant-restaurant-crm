import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import apiRoutes from "./server/routes/api";
import { sysLogs } from "./server/logs";
import { db, initDatabase } from "./server/db";
import { crmTenantAuth, requireRole, SecureRequest } from "./server/middlewares/tenant";
import { scheduleMonthlyCleanup } from "./server/archive";
import { startIikoCron } from "./server/cron/iiko-cron";
import { startReminderCron } from "./server/cron/reminder-cron";
import { initMockSyncIfNeeded } from "./server/iiko/sync";

const SENSITIVE_BODY_FIELDS = ["password", "owner_password", "password_hash"];

/** Убирает пароли/хэши, а также обрезает крупные base64-поля (фото блюд) перед записью в системные логи. */
function redactSensitiveFields(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const field of SENSITIVE_BODY_FIELDS) {
    if (field in clone) clone[field] = "***REDACTED***";
  }
  if (typeof clone.image_url === "string" && clone.image_url.length > 100) {
    clone.image_url = `[base64 image, ${clone.image_url.length} chars truncated]`;
  }
  return clone;
}

/** Хэнд-роллед CORS — без внешних зависимостей, чтобы с CRM мог работать сайт любого ресторана с любого origin. */
function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.header("Origin");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Restaurant-Key");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

async function startServer() {
  // Postgres-пул и схема должны быть готовы ДО приёма первого запроса — иначе первые
  // обращения к db.* посыпятся ошибками "relation does not exist". esbuild (cjs-бандл)
  // не поддерживает top-level await, поэтому инициализация явно await-ится здесь.
  await initDatabase();

  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  app.use(corsMiddleware);
  // Лимит увеличен с дефолтных 100kb — фото блюд меню загружаются как base64 data URL в JSON body.
  app.use(express.json({ limit: "6mb" }));

  app.use((req, res, next) => {
    const originalSend = res.send;
    let responseBody: any;

    res.send = function (chunk, ...args) {
      responseBody = chunk;
      return originalSend.apply(res, [chunk, ...args]);
    };

    res.on("finish", () => {
      if (
        req.url.startsWith("/api/v1/system") ||
        req.url.startsWith("/@vite") ||
        req.url.startsWith("/src/") ||
        req.url.endsWith(".css") ||
        req.url.endsWith(".js") ||
        req.url.includes("favicon")
      ) {
        return;
      }

      const tenantContext = req.restaurant_id || "None";
      let authType = "No Credentials";
      let role = "Guest";

      if (req.header("X-Restaurant-Key")) {
        authType = "X-Restaurant-Key API Token";
      } else if (req.header("Authorization")) {
        authType = "JWT Bearer Token";
        if (req.user) role = req.user.role;
      }

      let parsedResp: any = "";
      try {
        if (responseBody) parsedResp = JSON.parse(responseBody);
      } catch {
        parsedResp = typeof responseBody === "string" ? responseBody.substring(0, 100) : "";
      }

      sysLogs.addLog({
        method: req.method,
        url: req.url,
        headers: {
          "x-restaurant-key": req.header("X-Restaurant-Key") || "",
          authorization: req.header("Authorization") ? "Bearer *****" : "",
          "content-type": req.header("content-type") || "",
        },
        body: req.method !== "GET" ? redactSensitiveFields(req.body) : undefined,
        status: res.statusCode,
        tenant_context: tenantContext,
        auth_type: authType,
        role,
      });
    });

    next();
  });

  // ── Системные эндпоинты диагностики: доступны только super_admin (Bearer JWT) ──
  const systemAuth = [crmTenantAuth, requireRole(["super_admin"])];

  app.get("/api/v1/system/logs", ...systemAuth, (req: SecureRequest, res: Response) => {
    res.json(sysLogs.getLogs());
  });

  app.post("/api/v1/system/logs/clear", ...systemAuth, (req: SecureRequest, res: Response) => {
    sysLogs.clear();
    res.json({ message: "Logs cleared" });
  });

  app.get("/api/v1/system/db-dump", ...systemAuth, async (req: SecureRequest, res: Response) => {
    res.json(await db.systemDump());
  });

  app.post("/api/v1/system/db-reset", ...systemAuth, async (req: SecureRequest, res: Response) => {
    await db.reset();
    sysLogs.clear();
    res.json({ status: "success", message: "Database reset to initial seeds" });
  });

  app.use("/api/v1", apiRoutes);

  // Статика public
  app.use(express.static(path.join(process.cwd(), "public")));

  // ── Глобальный error middleware ──
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[Unhandled Error] ${req.method} ${req.url}:`, err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Внутренняя ошибка сервера. Запрос изолирован, сервис продолжает работу." });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Dashboard API] Listening on port ${PORT}`);
  });

  // Инициализируем mock-данные для всех существующих ресторанов (если пусто).
  try {
    const restaurants = await db.restaurants.findAll();
    await Promise.allSettled(restaurants.map((r) => initMockSyncIfNeeded(r.id)));
  } catch (err) {
    console.error("[init] Mock sync failed:", err);
  }

  scheduleMonthlyCleanup();
  startIikoCron();
  startReminderCron();
}

// ── Отказоустойчивость процесса: один сбойный таск не должен убивать весь Node-процесс ──
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] Процесс продолжает работу:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] Процесс продолжает работу:", reason);
});

startServer();
