// NotificationService — единая точка отправки уведомлений по событиям брони.
//
// Главный инвариант модуля: ошибка в уведомлении НИКОГДА не должна ронять основной
// ответ API. Поэтому все каналы запускаются через Promise.allSettled (один упавший
// канал не мешает остальным), а вызывающая сторона дополнительно оборачивает trigger()
// в .catch(console.error) и не await-ит его там, где результат не нужен.
//
// Настройки каждого ресторана (включённые каналы + его собственные API-ключи) кешируются
// в памяти процесса на 60 секунд, чтобы не ходить в БД на каждое событие. Кеш сбрасывается
// явно через invalidateCache() при сохранении настроек.

import { pool } from "../pgdb.js";
import { TEMPLATES } from "./templates.js";
import { sendWhatsApp } from "./channels/whatsapp.js";
import { sendEmail } from "./channels/email.js";
import { sendWebhook } from "./channels/webhook.js";

export type NotificationEvent =
  | "reservation.created"
  | "reservation.confirmed"
  | "reservation.cancelled"
  | "reservation.reminder";

export interface NotificationSettings {
  restaurant_id: string;
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  webhook_url: string | null;
  reminder_hours: number;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_from: string | null;
  resend_api_key: string | null;
}

class NotificationService {
  // null означает "у ресторана нет строки настроек" — это валидный закешированный ответ,
  // чтобы не делать повторный SELECT при каждом событии для ресторанов без уведомлений.
  private settingsCache = new Map<string, { data: NotificationSettings | null; expiresAt: number }>();

  async getSettings(restaurantId: string): Promise<NotificationSettings | null> {
    const cached = this.settingsCache.get(restaurantId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const { rows } = await pool.query(
      "SELECT * FROM notification_settings WHERE restaurant_id = $1",
      [restaurantId]
    );
    const data = (rows[0] as NotificationSettings | undefined) ?? null;
    this.settingsCache.set(restaurantId, { data, expiresAt: Date.now() + 60_000 });
    return data;
  }

  invalidateCache(restaurantId: string): void {
    this.settingsCache.delete(restaurantId);
  }

  /**
   * Разослать уведомление по событию брони во все включённые каналы ресторана.
   * Никогда не бросает наружу: любой сбой канала остаётся внутри Promise.allSettled.
   */
  async trigger(event: NotificationEvent, reservation: any, restaurantName?: string): Promise<void> {
    const settings = await this.getSettings(reservation.restaurant_id);
    if (!settings) return;

    let name = restaurantName;
    if (!name) {
      const { rows } = await pool.query("SELECT name FROM restaurants WHERE id = $1", [reservation.restaurant_id]);
      name = rows[0]?.name ?? "Ресторан";
    }
    const restaurantTitle = name as string;

    const text = TEMPLATES[event].whatsapp(reservation, restaurantTitle);

    const results = await Promise.allSettled([
      settings.whatsapp_enabled && reservation.customer_phone
        ? sendWhatsApp(reservation.customer_phone, text, settings)
        : Promise.resolve(),
      settings.email_enabled && reservation.customer_email
        ? sendEmail(reservation.customer_email, "Бронирование — " + restaurantTitle, text, settings)
        : Promise.resolve(),
      settings.webhook_url
        ? sendWebhook(event, { reservation, restaurant_name: restaurantTitle }, settings.webhook_url)
        : Promise.resolve(),
    ]);

    console.log("[notifications]", event, results);
  }
}

export const notificationService = new NotificationService();
