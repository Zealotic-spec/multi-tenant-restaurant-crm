-- 004_notifications.sql
-- Система автоматических уведомлений для бронирований (WhatsApp / Email / Webhook).
-- Каждый ресторан хранит собственные настройки каналов и свои API-ключи в notification_settings
-- (привязка по restaurant_id, каскадное удаление вместе с рестораном). Брони получают два новых
-- поля: customer_email (необязательный e-mail гостя) и reminder_sent (флаг идемпотентности cron-напоминаний).
-- Миграция идемпотентна (IF NOT EXISTS) — безопасно запускать при каждом старте сервера.

CREATE TABLE IF NOT EXISTS notification_settings (
  restaurant_id      TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  whatsapp_enabled   BOOLEAN NOT NULL DEFAULT false,
  email_enabled      BOOLEAN NOT NULL DEFAULT false,
  webhook_url        TEXT,
  reminder_hours     INTEGER NOT NULL DEFAULT 2,
  twilio_account_sid TEXT,
  twilio_auth_token  TEXT,
  twilio_from        TEXT,
  resend_api_key     TEXT
);

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS customer_email TEXT;
