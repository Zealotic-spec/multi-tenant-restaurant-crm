// Исходящий HTTP-webhook для интеграций ресторана (n8n / Zapier / Make / собственные системы).
//
// Отправляет POST { event, timestamp, data } на URL ресторана с таймаутом 5 секунд.
// В отличие от whatsapp/email, этот канал НИКОГДА не бросает: чужой медленный/упавший
// эндпоинт не должен влиять ни на основной API-ответ, ни на остальные каналы — любая
// ошибка только логируется через console.error.

const WEBHOOK_TIMEOUT_MS = 5000;

export async function sendWebhook(event: string, payload: object, webhookUrl: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Restaurant-Dashboard-Event": event,
      },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.error(`[webhook] ${event} → ${webhookUrl} ответил ${resp.status}`);
    }
  } catch (err) {
    console.error(`[webhook] ${event} → ${webhookUrl} не доставлен:`, err);
  } finally {
    clearTimeout(timer);
  }
}
