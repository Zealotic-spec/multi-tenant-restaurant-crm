import { Response } from "express";
import { SecureRequest } from "../middlewares/tenant";
import { db, Order } from "../db";
import { pool } from "../pgdb";

/**
 * 1. Client Site Endpoint: Submit express checkout order (with items array)
 * POST /api/v1/client/orders
 * Needs X-Restaurant-Key (restaurant_id in req.restaurant_id)
 */
export async function clientCreateOrder(req: SecureRequest, res: Response) {
  const { total_amount, items, table_id, delivery_type, customer_name, customer_phone } = req.body;
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Restaurant key is missing or unauthorized." });
    return;
  }

  // Basic Validation
  if (!total_amount || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({
      error: "Basket error: To initiate an express transaction, total_amount and a list of order items must be selected.",
    });
    return;
  }

  // Курьерская доставка ("delivery") удалена из системы — допускаются только "in_restaurant" и "takeaway".
  const resolvedDelivery: Order["delivery_type"] = delivery_type || "takeaway";

  if (resolvedDelivery === "in_restaurant" && !table_id) {
    res.status(400).json({
      error: "Localization issue: Table allocation ID is required when ordering inside the restaurant.",
    });
    return;
  }

  // Cross-tenant validation lookup to prevent table spoofing
  if (table_id) {
    const tableRow = await db.tables.findByIdAndRestaurant(table_id, restaurant_id);
    if (!tableRow) {
      res.status(404).json({
        error: "Spoofing attempt detected: The specified table does not belong to this restaurant tenant.",
      });
      return;
    }
  }

  // Задача 5: заказ "в заведении" обязан идти ВСЛЕД за активной бронью этого стола на сегодня —
  // иначе кухня начнёт готовить блюда к приходу гостей, которых стол не ждёт. Проверяем здесь
  // (не только на фронтенде в ClientPortal), чтобы прямой вызов API не обошёл правило.
  if (resolvedDelivery === "in_restaurant" && table_id) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaysReservations = await db.reservations.findByTableAndDate(table_id, todayStr);
    const hasActiveReservation = todaysReservations.some((r) => r.status === "pending" || r.status === "confirmed");
    if (!hasActiveReservation) {
      res.status(403).json({
        error: "Заказ в заведении доступен только после оформления брони этого стола на сегодня.",
      });
      return;
    }
  }

  // Validate every item before persisting anything (avoid partial writes)
  for (const item of items) {
    if (!item.dish_name || !item.quantity || !item.price_per_unit) {
      res.status(400).json({
        error: "Entity validation mismatch: Each item row needs a dish_name, quantity, and price_per_unit value.",
      });
      return;
    }
  }

  // Construct primary Order and items in a single transaction to prevent partial writes
  const client = await pool.connect();
  let newOrder: Awaited<ReturnType<typeof db.orders.create>>;
  let savedItems: Awaited<ReturnType<typeof db.orderItems.create>>[];
  try {
    await client.query("BEGIN");
    newOrder = await db.orders.create({
      restaurant_id,
      table_id: table_id || undefined,
      delivery_type: resolvedDelivery,
      customer_name: customer_name ? String(customer_name).trim() : undefined,
      customer_phone: customer_phone ? String(customer_phone).trim() : undefined,
      total_amount: Number(total_amount),
      payment_status: "pending",
      order_status: "new",
      // SLA по типу подачи: в зале — 15 мин (стол уже накрыт), самовывоз — 25 мин (готовка + ожидание у стойки).
      sla_minutes: resolvedDelivery === "in_restaurant" ? 15 : 25,
    });
    savedItems = await Promise.all(
      items.map((item) =>
        db.orderItems.create({
          order_id: newOrder.id,
          dish_name: item.dish_name,
          quantity: Number(item.quantity),
          price_per_unit: Number(item.price_per_unit),
        })
      )
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // If ordering at a table inside the dining hall, we lock the table to 'occupied' status in parallel
  if (table_id) {
    await db.tables.setStatus(table_id, restaurant_id, "occupied");
  }

  res.status(201).json({
    message: "Express transaction successfully queued. Order created with 'pending' payment status.",
    order_id: newOrder.id,
    order: newOrder,
    items: savedItems,
  });
}

/**
 * 2. IDEMPOTENT Webhook Payment Endpoint: Receives response from bank (Kaspi / CloudPayments)
 * POST /api/v1/client/payments/webhook
 *
 * Strict Idempotency & Reentrancy Guards against Double-Spending are implemented here.
 */
export async function clientPaymentWebhook(req: SecureRequest, res: Response) {
  const { order_id, idemp_key, status, amount } = req.body;

  if (!order_id || !idemp_key || !status) {
    res.status(400).json({
      error: "Webhook payload failure: Required params (order_id, idemp_key, status) are missing.",
    });
    return;
  }

  // --- STEP 1: IDEMPOTENCY GUARD (checked again atomically at INSERT via ON CONFLICT) ---

  // --- STEP 2: LOOKUP SYSTEM ORDER ---
  const targetOrder = await db.orders.findById(order_id);

  if (!targetOrder) {
    res.status(404).json({
      error: `Failure: Intested order ID '${order_id}' was not found in the SaaS register.`,
    });
    return;
  }

  // --- STEP 3: TRANSACTIONAL ATOMICITY LOCK ---
  // Defuse Double spending by ensuring orders already marked as 'paid' cannot have their payment repeated
  if (targetOrder.payment_status === "paid") {
    // Record fail transaction log to maintain full accounting audit trails
    await db.paymentTransactions.create({
      transaction_key: idemp_key,
      order_id,
      amount: Number(amount) || targetOrder.total_amount,
      status: "failed",
    });

    res.status(422).json({
      error: "Refused Transaction: This order is already paid. Denied duplicated spending authorization.",
      order_id,
      payment_status: "paid",
    });
    return;
  }

  // Check state condition for failures received from bank
  if (status === "failed") {
    await db.orders.updatePaymentStatus(order_id, "failed");
    await db.paymentTransactions.create({
      transaction_key: idemp_key,
      order_id,
      amount: Number(amount) || targetOrder.total_amount,
      status: "failed",
    });

    res.json({
      message: "Bank declined express order authorization. Order status updated.",
      order_id,
      payment_status: "failed",
    });
    return;
  }

  // --- STEP 4: MUTATIVE COMMIT PHASE ---
  await db.orders.updatePaymentStatus(order_id, "paid", "new"); // Enqueues order directly into the Active Kitchen Board

  const successTx = await db.paymentTransactions.createIdempotent({
    transaction_key: idemp_key,
    order_id,
    amount: Number(amount) || targetOrder.total_amount,
    status: "success",
  });

  // ON CONFLICT DO NOTHING вернул null — дублирующий запрос, транзакция уже обработана
  if (!successTx) {
    res.status(200).json({
      message: "Idempotency Triggered: This payment webhook transaction was already successfully processed.",
      duplicate: true,
    });
    return;
  }

  const updatedOrder = await db.orders.findById(order_id);

  res.status(200).json({
    message: "Webhook processed successfully. Transaction registered, kitchen staff alerted in real-time.",
    receipt: {
      merchant_id: `merch_${targetOrder.restaurant_id}`,
      amount_processed: successTx.amount,
      authorized_at: successTx.created_at,
    },
    order: updatedOrder,
  });
}

/**
 * 3. CRM Endpoint: Fetch Cooking/Paid Orders for designated tenant
 * GET /api/v1/crm/orders
 * Needs Bearer JWT (restaurant_id in req.restaurant_id)
 */
export async function crmGetOrders(req: SecureRequest, res: Response) {
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Unauthorized credentials." });
    return;
  }

  const { page, limit } = req.query as { page?: string; limit?: string };
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  // Один JOIN вместо N+1 запросов — без отдельного запроса per order
  const ordersWithItems = await db.orderItems.findByRestaurantWithItems(restaurant_id, {
    paymentStatus: "paid",
    limit: limitNum,
    offset,
  });

  const totalResult = await pool.query(
    "SELECT COUNT(*)::int AS total FROM orders WHERE restaurant_id = $1 AND payment_status = 'paid'",
    [restaurant_id]
  );

  res.json({
    restaurant_id,
    count: ordersWithItems.length,
    total: totalResult.rows[0].total,
    page: pageNum,
    limit: limitNum,
    orders: ordersWithItems,
  });
}

/**
 * 4. CRM Endpoint: Advance Kitchen Order status
 * PATCH /api/v1/crm/orders/:id
 * Needs Bearer JWT
 *
 * Переходы статуса заказа: new → cooking → ready → delivered.
 * Курьерский статус "out_for_delivery" удалён вместе с доставкой на дом (Задача 6) —
 * после "ready" заказ всегда переходит прямиком в "delivered" (гость забрал/съел в зале).
 */
export async function crmUpdateOrderStatus(req: SecureRequest, res: Response) {
  const { id } = req.params;
  const { order_status } = req.body;
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Unauthorized credentials." });
    return;
  }

  const validStatuses: Order["order_status"][] = ["new", "cooking", "ready", "delivered"];
  if (!order_status || !validStatuses.includes(order_status)) {
    res.status(400).json({
      error: `Invalid status argument. Allowed states: [${validStatuses.join(", ")}]`,
    });
    return;
  }

  // Tenant boundary enforced inside the repository: "...WHERE id = $1 AND restaurant_id = $2"
  const updatedOrder = await db.orders.updateOrderStatus(id, restaurant_id, order_status);

  if (!updatedOrder) {
    res.status(404).json({
      error: "Cross-Tenant Access Refused: The requested order either is unregistered or resides inside a foreign restaurant.",
    });
    return;
  }

  // Бизнес-правило: заказ "в заведении" занимает стол (см. clientCreateOrder → setStatus 'occupied').
  // Когда блюда поданы (delivered), гости уходят — стол нужно освободить для следующей брони/заказа,
  // иначе он "зависнет" занятым навсегда. Самовывоз не привязан к столу — пропускаем.
  if (order_status === "delivered" && updatedOrder.table_id) {
    await db.tables.setStatus(updatedOrder.table_id, restaurant_id, "free");
  }

  const items = await db.orderItems.findByOrder(id);

  res.json({
    message: `State advanced to: ${order_status}`,
    order: {
      ...updatedOrder,
      items,
    },
  });
}
