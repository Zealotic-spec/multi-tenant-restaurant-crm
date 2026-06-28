// CRON-планировщик напоминаний о бронированиях: каждые 5 минут находит брони,
// до которых осталось не больше reminder_hours (настройка ресторана), и шлёт
// гостю напоминание. reminder_sent гарантирует, что напоминание уйдёт ровно один раз.
//
// Замечание по SQL: для арифметики со временем используется LOCALTIME (тип `time`),
// а не CURRENT_TIME (тип `time with time zone`) — в Postgres нет оператора
// `time - timetz`, поэтому вариант с CURRENT_TIME падал бы на каждом запуске.
// Колонки reservations.date и reservations.time — TEXT ('YYYY-MM-DD' / 'HH:MM'),
// поэтому явно кастуем их к ::date / ::time.

import cron from "node-cron";
import { pool } from "../pgdb.js";
import { notificationService } from "../notifications/index.js";

let started = false;

export function startReminderCron(): void {
  if (started) return;
  started = true;

  cron.schedule("*/5 * * * *", async () => {
    try {
      const { rows } = await pool.query(`
        SELECT r.*, rest.name AS restaurant_name
        FROM reservations r
        JOIN restaurants rest ON rest.id = r.restaurant_id
        JOIN notification_settings ns ON ns.restaurant_id = r.restaurant_id
        WHERE r.status IN ('pending', 'confirmed')
          AND r.reminder_sent = false
          AND r.date::date = CURRENT_DATE
          AND (r.time::time - LOCALTIME)
              BETWEEN INTERVAL '0 minutes'
              AND (ns.reminder_hours || ' hours')::interval
      `);

      for (const row of rows) {
        await notificationService.trigger("reservation.reminder", row, row.restaurant_name);
        await pool.query(
          "UPDATE reservations SET reminder_sent = true WHERE id = $1",
          [row.id]
        );
      }

      if (rows.length > 0) {
        console.log("[reminder-cron] Sent reminders:", rows.length);
      }
    } catch (err) {
      console.error("[reminder-cron] Error:", err);
    }
  });

  console.log("[reminder-cron] Scheduled: every 5 minutes");
}
