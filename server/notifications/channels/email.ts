// Канал Email через Resend API (нативный fetch).
//
// API-ключ выбирается с приоритетом ключа ресторана над глобальным env.
// Если ключа нет ни там, ни там — функция тихо возвращается (канал не настроен).

import type { NotificationSettings } from "../index.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_ADDRESS = "notifications@restaurant-dashboard.io";

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  settings: NotificationSettings
): Promise<void> {
  const apiKey = settings.resend_api_key || process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const resp = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, text }),
  });

  // Бросаем при не-2xx — см. комментарий в whatsapp.ts: ошибку перехватит allSettled / test-роут.
  if (!resp.ok) {
    throw new Error(`Resend email failed: ${resp.status} ${await resp.text()}`);
  }
}
