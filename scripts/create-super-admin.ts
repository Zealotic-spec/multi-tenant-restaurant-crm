/**
 * Скрипт создания super_admin аккаунта и первого invite-кода.
 * Запуск: npx tsx scripts/create-super-admin.ts
 *
 * Запускай ОДИН раз после деплоя на свежей БД.
 * Если аккаунт уже существует — скрипт выведет предупреждение и не создаст дубликат.
 */

import Database from "better-sqlite3";
import { randomBytes, scryptSync } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../data/crm.db");

// ─── Настройки — измени перед запуском ───────────────────────────────────────
const ADMIN_EMAIL    = "askiloff10@gmail.com";   // ← твой email
const ADMIN_PASSWORD = "Nurisss-love3";     // ← твой пароль (поменяй!)
const INVITE_CODE    = "START2026";    // ← код для первого клиента
// ─────────────────────────────────────────────────────────────────────────────

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Проверяем существующий super_admin
const existing = db.prepare("SELECT id, email FROM users WHERE role = 'super_admin' LIMIT 1").get() as any;

if (existing) {
  console.log("⚠️  Super admin уже существует:");
  console.log(`   Email: ${existing.email}`);
  console.log(`   ID:    ${existing.id}`);
  console.log("\nЕсли хочешь сбросить пароль — используй эндпоинт /api/v1/system/db-reset (только super_admin)");
} else {
  const id = randomId("usr");
  const hash = hashPassword(ADMIN_PASSWORD);
  db.prepare(
    "INSERT INTO users (id, restaurant_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)"
  ).run(id, "system", ADMIN_EMAIL, hash, "super_admin");

  console.log("✅ Super Admin создан:");
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   ID:       ${id}`);
}

// Создаём invite-код если такого ещё нет
const existingCode = db.prepare(
  "SELECT code FROM founder_invite_codes WHERE code = ?"
).get(INVITE_CODE) as any;

if (existingCode) {
  console.log(`\n⚠️  Invite-код "${INVITE_CODE}" уже существует в БД`);
} else {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO founder_invite_codes (code, created_at, used_at, used_by_user_id, note) VALUES (?, ?, ?, ?, ?)"
  ).run(INVITE_CODE, now, null, null, "Первый код для подключения клиента");

  console.log(`\n✅ Invite-код создан: ${INVITE_CODE}`);
  console.log("   Выдай этот код первому клиенту для регистрации");
}

// Показываем все коды
const codes = db.prepare("SELECT code, used_at, note FROM founder_invite_codes ORDER BY created_at DESC").all() as any[];
console.log("\n📋 Все invite-коды в базе:");
codes.forEach(c => {
  const status = c.used_at ? "✗ ИСПОЛЬЗОВАН" : "✓ Свободен";
  console.log(`   [${status}] ${c.code}  — ${c.note || ""}`);
});

db.close();
console.log("\nГотово! Теперь можешь войти в CRM с email/password из этого скрипта.");
