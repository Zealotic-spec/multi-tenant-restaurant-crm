// CRON-планировщик iiko синка: каждые 15 минут обновляет кэш аналитики для
// всех ресторанов у которых есть iiko_credentials.
// Используется пакет node-cron (см. package.json).

import cron from "node-cron";
import { pool } from "../pgdb.js";
import { syncRestaurant } from "../iiko/sync.js";

let cronStarted = false;

export function startIikoCron(): void {
  if (cronStarted) return;
  cronStarted = true;

  // Каждые 15 минут
  cron.schedule("*/15 * * * *", async () => {
    console.log("[iiko-cron] Starting scheduled sync...");
    try {
      const result = await pool.query(
        "SELECT restaurant_id FROM iiko_credentials"
      );
      const ids: string[] = result.rows.map((r) => r.restaurant_id);

      if (ids.length === 0) {
        console.log("[iiko-cron] No restaurants with iiko credentials, skipping.");
        return;
      }

      const results = await Promise.allSettled(ids.map((id) => syncRestaurant(id)));
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.error(`[iiko-cron] Failed to sync restaurant ${ids[i]}:`, r.reason);
        } else {
          console.log(`[iiko-cron] Synced restaurant ${ids[i]}`);
        }
      });
    } catch (err) {
      console.error("[iiko-cron] Scheduler error:", err);
    }
  });

  console.log("[iiko-cron] Scheduled: every 15 minutes");
}
