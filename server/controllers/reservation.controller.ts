import { Response } from "express";
import { SecureRequest } from "../middlewares/tenant";
import { db, Reservation } from "../db";

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
export function clientCreateReservation(req: SecureRequest, res: Response) {
  const { customer_name, customer_phone, date, time, guests_count, table_id } = req.body;
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
  const targetTable = db.tables.findByIdAndRestaurant(table_id, restaurant_id);
  if (!targetTable) {
    res.status(404).json({
      error: "Spoofing attempt: This table is either invalid or of another restaurant tenant.",
    });
    return;
  }

  // --- OVERBOOKING INTERLOCK ALGORITHM (-2h / +2h collision guard) ---
  const currentReqMins = parseTimeToMinutes(time);

  const sameDayReservations = db.reservations.findByTableAndDate(table_id, date);
  const conflictingRes = sameDayReservations.find((existing) => {
    if (existing.status === "cancelled") return false;
    const existingMins = parseTimeToMinutes(existing.time);
    const diffMinutes = Math.abs(currentReqMins - existingMins);
    // Collision window: Less than 120 minutes (2 hours)
    return diffMinutes < 120;
  });

  if (conflictingRes) {
    res.status(409).json({
      error: `Овербукинг заблокирован: Стол №${targetTable.table_number} уже зарезервирован на ${conflictingRes.time}. Корпоративная политика SaaS безопасности накладывает строгий интервал парковки стола в ±2 часа для дезинфекции и сервировки.`,
      conflicting_time: conflictingRes.time,
      table_number: targetTable.table_number,
    });
    return;
  }

  // If validation passes, create the reservation record
  const newReservation = db.reservations.create({
    restaurant_id, // Confinement Key
    customer_name,
    customer_phone,
    date,
    time,
    guests_count: Number(guests_count),
    table_id,
    status: "confirmed", // Auto-confirm on client simulation for seamless experience
  });

  // Set the table status to 'reserved' in the floor plan to showcase reactive visual updates
  db.tables.setStatus(table_id, "reserved");
  const updatedTable = db.tables.findByIdAndRestaurant(table_id, restaurant_id);

  res.status(201).json({
    message: "Резерв успешно внесен! Овербукинг валидирован — пересечений времени нет.",
    reservation: newReservation,
    updated_table: updatedTable,
  });
}

/**
 * 2. CRM Endpoint: Fetch Reservations
 * Requires Bearer Token JWT (restaurant_id in injected in req.restaurant_id)
 */
export function crmGetReservations(req: SecureRequest, res: Response) {
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Unauthorized credentials." });
    return;
  }

  // Tenant boundary enforced at the SQL WHERE clause level (repository method)
  const reservations = db.reservations.findByRestaurant(restaurant_id);

  res.json({
    restaurant_id,
    count: reservations.length,
    reservations,
  });
}

/**
 * 3. CRM Endpoint: Update Reservation Status
 * Requires Bearer Token JWT (must guard against cross-tenant tampering)
 */
export function crmUpdateReservation(req: SecureRequest, res: Response) {
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
  const existing = db.reservations.findByIdAndRestaurant(id, restaurant_id);
  if (!existing) {
    res.status(404).json({
      error: "Error: Reservation either does not exist or belongs to another restaurant tenant.",
    });
    return;
  }

  const updatedRes = db.reservations.updateStatus(id, restaurant_id, status)!;

  // Reactively release/modify table floor representation if booking is completed or cancelled
  if (status === "completed" || status === "cancelled") {
    db.tables.setStatus(updatedRes.table_id, "free");
  } else if (status === "confirmed") {
    db.tables.setStatus(updatedRes.table_id, "reserved");
  }

  res.json({
    message: "Reservation status updated.",
    reservation: updatedRes,
  });
}
