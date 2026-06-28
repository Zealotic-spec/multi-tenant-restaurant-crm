// Тексты уведомлений для гостя на русском языке (с эмодзи).
// Каждый шаблон — функция (reservation, restaurantName) → строка, чтобы подставить
// актуальные поля брони. Один и тот же текст используется для всех каналов (whatsapp/email/webhook),
// поэтому метод называется whatsapp() — это исторический «основной» канал, но текст канал-агностичен.

import type { NotificationEvent } from "./index.js";

type TemplateFn = (reservation: any, restaurantName: string) => string;

export const TEMPLATES: Record<NotificationEvent, { whatsapp: TemplateFn }> = {
  "reservation.created": {
    whatsapp: (r, restaurantName) =>
      `✅ Бронь подтверждена!\n\n🍽 ${restaurantName}\n📅 ${r.date} в ${r.time}\n👥 ${r.guests_count} чел.\n\nЖдём вас! Для отмены позвоните нам.`,
  },
  "reservation.confirmed": {
    whatsapp: (r, restaurantName) =>
      `✅ Ваша бронь подтверждена администратором.\n🍽 ${restaurantName} — ${r.date} в ${r.time}.\nЖдём вас!`,
  },
  "reservation.cancelled": {
    whatsapp: (r, restaurantName) =>
      `❌ Ваша бронь на ${r.date} в ${r.time} отменена.\nЕсли это ошибка — позвоните нам.`,
  },
  "reservation.reminder": {
    whatsapp: (r, restaurantName) =>
      `🔔 Напоминание! Ваш столик в ${restaurantName} сегодня в ${r.time}.\nГостей: ${r.guests_count} чел. До встречи! 🍽`,
  },
};
