import { Pool } from "pg";

/**
 * Единый PostgreSQL Pool для всего сервера. Конфигурация — из переменных окружения,
 * с дефолтами под локальную разработку (docker/локальный postgres на стандартном порту).
 *
 * PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE — стандартные имена переменных,
 * которые понимает сама библиотека `pg` "из коробки".
 */
export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "postgres",
      database: process.env.PGDATABASE || "restaurant_crm",
    });

// Изоляция ошибок на уровне пула: обрыв соединения у одного клиента в пуле не должен
// приводить к падению всего Node-процесса (тот же принцип отказоустойчивости, что и
// в server.ts для uncaughtException/unhandledRejection).
pool.on("error", (err) => {
  console.error("[pg Pool] Unexpected error on idle client (процесс продолжает работу):", err);
});
