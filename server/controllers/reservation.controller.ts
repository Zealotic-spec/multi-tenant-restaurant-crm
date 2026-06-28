import { Response } from "express";
import { SecureRequest } from "../middlewares/tenant";
import { db, Reservation } from "../db";
import { notificationService } from "../notifications/index.js";

/**
 * Parses time format "HH:MM" into pure minutes of the day.
 * Example: "19:30" => 19 * 60 + 30 = 1170 mins
 */
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length !== 2) return 0;
  return Number(parts[0]) * 60 + Number(parts[1]);
}

/**
 * 1. Client Site Endpoint: Create Reservation with Overbooking Collision Guard
 * Requires X-Restaurant-Key (restaurant_id is injected in req.restaurant_id)
 */
export async function clientCreateReservation(req: SecureRequest, res: Response) {
  const { customer_name, customer_phone, customer_email, date, time, guests_count, table_id } = req.body;
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Restaurant key is missing or unauthorized." });
    return;
  }

  if (!customer_name || !customer_phone || !date || !time || !guests_count || !table_id) {
    res.status(400).json({ error: "Validation failure: All reservation fields and a target Table are required." });
    return;
  }

  // Verify the target dining table actually belongs to this restaurant context
  const targetTable = await db.tables.findByIdAndRestaurant(table_id, restaurant_id);
  if (!targetTable) {
    res.status(404).json({
      error: "Spoofing attempt: This table is either invalid or of another restaurant tenant.",
    });
    return;
  }

  // --- OVERBOOKING INTERLOCK ALGORITHM (-1.5h / +1.5h collision guard) ---
  const currentReqMins = parseTimeToMinutes(time);

  const sameDayReservations = await db.reservations.findByTableAndDate(table_id, date);
  const conflictingRes = sameDayReservations.find((existing) => {
    if (existing.status === "cancelled") return false;
    const existingMins = parseTimeToMinutes(existing.time);
    const diffMinutes = Math.abs(currentReqMins - existingMins);
    // Collision window: Less than 90 minutes (1 час 30 минут) — длительность одной брони (Задача 3)
    return diffMinutes < 90;
  });

  if (conflictingRes) {
    res.status(409).json({
      error: `Овербукинг заблокирован: Стол №${targetTable.table_number} уже зарезервирован на ${conflictingRes.time}. Корпоративная политика SaaS безопасности накладывает строгий интервал парковки стола в ±1.5 часа для дезинфекции и сервировки.`,
      conflicting_time: conflictingRes.time,
      table_number: targetTable.table_number,
    });
    return;
  }

  // If validation passes, create the reservation record
  const newReservation = await db.reservations.create({
    restaurant_id,
    customer_name,
    customer_phone,
    customer_email: customer_email ?? null,
    date,
    time,
    guests_count: Number(guests_count),
    table_id,
    status: "confirmed",
  });

  // Fire-and-forget: уведомление гостю о созданной брони не должно блокировать/ронять
  // ответ API. Любая ошибка канала остаётся внутри notificationService (Promise.allSettled)
  // плюс финальный .catch на случай сбоя самого trigger().
  notificationService.trigger("reservation.created", newReservation).catch(console.error);

  // Обновляем статус стола только если бронь на сегодня и время уже наступило (±1.5ч от сейчас).
  // Так стол не "зависает" как "reserved" на весь день после будущего бронирования.
  const todayStr = new Date().toISOString().split("T")[0];
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const resMins = parseTimeToMinutes(time);
  if (date === todayStr && Math.abs(nowMins - resMins) < 90) {
    await db.tables.setStatus(table_id, restaurant_id, "reserved");
  }
  const updatedTable = await db.tables.findByIdAndRestaurant(table_id, restaurant_id);

  res.status(201).json({
    message: "Резерв успешно внесен! Овербукинг валидирован — пересечений времени нет.",
    reservation: newReservation,
    updated_table: updatedTable,
  });
}

/**
 * 2. CRM Endpoint: Create Reservation (from dashboard)
 * Requires Bearer JWT — restaurant_id from crmTenantAuth, not from body.
 * Same overbooking guard as clientCreateReservation.
 */
export async function crmCreateReservation(req: SecureRequest, res: Response) {
  const { customer_name, customer_phone, customer_email, date, time, guests_count, table_id } = req.body;
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "Unauthorized." });
    return;
  }

  if (!customer_name || !customer_phone || !date || !time || !guests_count || !table_id) {
    res.status(400).json({ error: "Заполните все обязательные поля: имя, телефон, дата, время, гостей, стол." });
    return;
  }

  const targetTable = await db.tables.findByIdAndRestaurant(table_id, restaurant_id);
  if (!targetTable) {
    res.status(404).json({ error: "Стол не найден или принадлежит другому ресторану." });
    return;
  }

  const currentReqMins = parseTimeToMinutes(time);
  const sameDayReservations = await db.reservations.findByTableAndDate(table_id, date);
  const conflictingRes = sameDayReservations.find((existing) => {
    if (existing.status === "cancelled") return false;
    return Math.abs(currentReqMins - parseTimeToMinutes(existing.time)) < 90;
  });

  if (conflictingRes) {
    res.status(409).json({
      error: `Стол №${targetTable.table_number} уже зарезервирован на ${conflictingRes.time}. Интервал ±1.5ч.`,
      conflicting_time: conflictingRes.time,
    });
    return;
  }

  const newReservation = await db.reservations.create({
    restaurant_id,
    customer_name,
    customer_phone,
    customer_email: customer_email || null,
    date,
    time,
    guests_count: Number(guests_count),
    table_id,
    status: "confirmed",
  });

  notificationService.trigger("reservation.created", newReservation).catch(console.error);

  const todayStr = new Date().toISOString().split("T")[0];
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  if (date === todayStr && Math.abs(nowMins - parseTimeToMinutes(time)) < 90) {
    await db.tables.setStatus(table_id, restaurant_id, "reserved");
  }

  res.status(201).json({ message: "Бронирование создано.", reservation: newReservation });
}

/**
 * 3. CRM Endpoint: Fetch Reservations
 * Requires Bearer Token JWT (restaurant_id in injected in req.restaurant_id)
 */
export async function crmGetReservations(req: SecureRequest, res: Response) {
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Unauthorized credentials." });
    return;
  }

  const { page, limit } = req.query as { page?: string; limit?: string };
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  const [reservations, total] = await Promise.all([
    db.reservations.findByRestaurant(restaurant_id, { limit: limitNum, offset }),
    db.reservations.countByRestaurant(restaurant_id),
  ]);

  res.json({
    restaurant_id,
    count: reservations.length,
    total,
    page: pageNum,
    limit: limitNum,
    reservations,
  });
}

/**
 * 3. CRM Endpoint: Update Reservation Status
 * Requires Bearer Token JWT (must guard against cross-tenant tampering)
 */
export async function crmUpdateReservation(req: SecureRequest, res: Response) {
  const { id } = req.params;
  const { status } = req.body;
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Unauthorized credentials." });
    return;
  }

  const validStatuses: Reservation["status"][] = ["pending", "confirmed", "completed", "cancelled"];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({
      error: `Invalid reservation status. Must be one of: [${validStatuses.join(", ")}]`,
    });
    return;
  }

  // Hardened Multi-Tenant Check happens inside the repository update (id + restaurant_id)
  const existing = await db.reservations.findByIdAndRestaurant(id, restaurant_id);
  if (!existing) {
    res.status(404).json({
      error: "Error: Reservation either does not exist or belongs to another restaurant tenant.",
    });
    return;
  }

  const updatedRes = (await db.reservations.updateStatus(id, restaurant_id, status))!;

  // Reactively release/modify table floor representation if booking is completed or cancelled
  if (status === "completed" || status === "cancelled") {
    await db.tables.setStatus(updatedRes.table_id, restaurant_id, "free");
  } else if (status === "confirmed") {
    await db.tables.setStatus(updatedRes.table_id, restaurant_id, "reserved");
  }

  // Fire-and-forget уведомления гостю при смене статуса администратором (см. clientCreateReservation).
  if (status === "confirmed") {
    notificationService.trigger("reservation.confirmed", updatedRes).catch(console.error);
  }
  if (status === "cancelled") {
    notificationService.trigger("reservation.cancelled", updatedRes).catch(console.error);
  }

  res.json({
    message: "Reservation status updated.",
    reservation: updatedRes,
  });
}
