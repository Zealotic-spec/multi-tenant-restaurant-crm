// Канал WhatsApp через Twilio REST API (нативный fetch, без SDK).
//
// Учётные данные выбираются с приоритетом настроек ресторана над глобальными env:
// каждый ресторан может подключить свой Twilio-аккаунт, а демо/новые рестораны
// падают на общий аккаунт из process.env. Если нет ни одного набора credentials —
// функция тихо возвращается (это не ошибка, просто канал не настроен).

import type { NotificationSettings } from "../index.js";

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

/** "+7 999 123-45-67" → "whatsapp:+79991234567" (убираем пробелы/дефисы, гарантируем ведущий "+"). */
function toWhatsAppAddress(raw: string): string {
  const normalized = raw.replace(/[\s-]/g, "");
  const withPlus = normalized.startsWith("+") ? normalized : `+${normalized}`;
  return `whatsapp:${withPlus}`;
}

export async function sendWhatsApp(to: string, text: string, settings: NotificationSettings): Promise<void> {
  const accountSid = settings.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = settings.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
  const from = settings.twilio_from || process.env.TWILIO_WHATSAPP_FROM;

  // Нет учётных данных — канал просто не настроен у этого ресторана. Тихо выходим.
  if (!accountSid || !authToken || !from) return;

  const body = new URLSearchParams({
    From: from,
    To: toWhatsAppAddress(to),
    Body: text,
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const resp = await fetch(`${TWILIO_BASE}/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  // Бросаем при не-2xx, чтобы Promise.allSettled в trigger() и /notifications/test
  // увидели причину сбоя. Наружу в основной API-ответ это всё равно не прорвётся.
  if (!resp.ok) {
    throw new Error(`Twilio WhatsApp failed: ${resp.status} ${await resp.text()}`);
  }
}
