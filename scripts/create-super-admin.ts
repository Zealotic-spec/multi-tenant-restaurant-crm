/**
 * Скрипт создания super_admin аккаунта и первого invite-кода.
 * Запуск: npx tsx scripts/create-super-admin.ts
 *
 * Запускай ОДИН раз после деплоя на свежей БД.
 * Если аккаунт уже существует — скрипт выведет предупреждение и не создаст дубликат.
 *
 * ВАЖНО: после миграции на PostgreSQL (Задача 2) этот скрипт работает через тот же
 * Postgres-пул, что и весь остальной бэкенд (server/db.ts) — НЕ через отдельный
 * sqlite-файл, как раньше. initDatabase() уже сам сеет демо-super_admin
 * (superadmin@saas.io / password123) при первом запуске на пустой БД — этот скрипт
 * нужен только если ты хочешь создать СВОЙ аккаунт с собственным email/паролем.
 */

import { db, initDatabase } from "../server/db";
import { hashPassword } from "../server/utils/password";
import { randomUUID } from "crypto";

// ─── Настройки — измени перед запуском ───────────────────────────────────────
const ADMIN_EMAIL = "askiloff10@gmail.com"; // ← твой email
const ADMIN_PASSWORD = "Nurisss-love3"; // ← твой пароль (поменяй!)
const INVITE_CODE = "START2026"; // ← код для первого клиента
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  await initDatabase();

  const existing = await db.users.findByEmail(ADMIN_EMAIL);

  if (existing && existing.role === "super_admin") {
    console.log("⚠️  Super admin уже существует:");
    console.log(`   Email: ${existing.email}`);
    console.log(`   ID:    ${existing.id}`);
    console.log("\nЕсли хочешь сбросить пароль — используй эндпоинт /api/v1/system/db-reset (только super_admin)");
  } else if (existing) {
    console.log(`⚠️  Пользователь с email ${ADMIN_EMAIL} уже существует с ролью '${existing.role}' — пропускаю создание.`);
  } else {
    const user = await db.users.create({
      id: `usr_${randomUUID()}`,
      restaurant_id: "system",
      email: ADMIN_EMAIL,
      password_hash: hashPassword(ADMIN_PASSWORD),
      role: "super_admin",
    });

    console.log("✅ Super Admin создан:");
    console.log(`   Email:    ${user.email}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   ID:       ${user.id}`);
  }

  const existingCode = await db.inviteCodes.findByCode(INVITE_CODE);
  if (existingCode) {
    console.log(`\n⚠️  Invite-код "${INVITE_CODE}" уже существует в БД`);
  } else {
    await db.inviteCodes.create({ code: INVITE_CODE, note: "Первый код для подключения клиента" });
    console.log(`\n✅ Invite-код создан: ${INVITE_CODE}`);
    console.log("   Выдай этот код первому клиенту для регистрации");
  }

  const codes = await db.inviteCodes.findAll();
  console.log("\n📋 Все invite-коды в базе:");
  codes.forEach((c) => {
    const status = c.used_at ? "✗ ИСПОЛЬЗОВАН" : "✓ Свободен";
    console.log(`   [${status}] ${c.code}  — ${c.note || ""}`);
  });

  console.log("\nГотово! Теперь можешь войти в CRM с email/password из этого скрипта.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Ошибка скрипта create-super-admin:", err);
  process.exit(1);
});
