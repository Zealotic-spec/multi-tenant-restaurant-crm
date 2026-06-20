import { Response } from "express";
import { SecureRequest } from "../middlewares/tenant";
import { db, Order } from "../db";

/**
 * 1. Client Site Endpoint: Submit express checkout order (with items array)
 * POST /api/v1/client/orders
 * Needs X-Restaurant-Key (restaurant_id in req.restaurant_id)
 */
export function clientCreateOrder(req: SecureRequest, res: Response) {
  const { total_amount, items, table_id, delivery_type, delivery_address, customer_name, customer_phone } = req.body;
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

  // Delivery configuration checks
  const resolvedDelivery: Order["delivery_type"] = delivery_type || "takeaway";

  if (resolvedDelivery === "in_restaurant" && !table_id) {
    res.status(400).json({
      error: "Localization issue: Table allocation ID is required when ordering inside the restaurant.",
    });
    return;
  }

  if (resolvedDelivery === "delivery") {
    if (!String(delivery_address || "").trim()) {
      res.status(400).json({
        error: "Delivery address required: delivery_address must be provided when delivery_type is 'delivery'.",
      });
      return;
    }
    if (!String(customer_name || "").trim() || !String(customer_phone || "").trim()) {
      res.status(400).json({
        error: "Courier contact required: customer_name and customer_phone must be provided when delivery_type is 'delivery'.",
      });
      return;
    }
  }

  // Cross-tenant validation lookup to prevent table spoofing
  if (table_id) {
    const tableRow = db.tables.findByIdAndRestaurant(table_id, restaurant_id);
    if (!tableRow) {
      res.status(404).json({
        error: "Spoofing attempt detected: The specified table does not belong to this restaurant tenant.",
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

  // Construct primary Order (State initialized as pending and cooking state 'new')
  const newOrder = db.orders.create({
    restaurant_id,
    table_id: table_id || undefined,
    delivery_type: resolvedDelivery,
    delivery_address: resolvedDelivery === "delivery" ? String(delivery_address).trim() : undefined,
    customer_name: customer_name ? String(customer_name).trim() : undefined,
    customer_phone: customer_phone ? String(customer_phone).trim() : undefined,
    total_amount: Number(total_amount),
    payment_status: "pending",
    order_status: "new",
    // SLA по типу подачи: в зале — 15 мин, доставка на дом — 45 мин (готовка + время курьера), самовывоз — 25 мин
    sla_minutes: resolvedDelivery === "in_restaurant" ? 15 : resolvedDelivery === "delivery" ? 45 : 25,
  });

  // Persist order items inside the relational-bound database
  const savedItems = items.map((item) =>
    db.orderItems.create({
      order_id: newOrder.id,
      dish_name: item.dish_name,
      quantity: Number(item.quantity),
      price_per_unit: Number(item.price_per_unit),
    })
  );

  // If ordering at a table inside the dining hall, we lock the table to 'occupied' status in parallel
  if (table_id) {
    db.tables.setStatus(table_id, "occupied");
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
export function clientPaymentWebhook(req: SecureRequest, res: Response) {
  const { order_id, idemp_key, status, amount } = req.body;

  if (!order_id || !idemp_key || !status) {
    res.status(400).json({
      error: "Webhook payload failure: Required params (order_id, idemp_key, status) are missing.",
    });
    return;
  }

  // --- STEP 1: IDEMPOTENCY GUARD ---
  // If transaction has already been processed for this unique token, yield cached response immediately
  const existingTx = db.paymentTransactions.findByKey(idemp_key);

  if (existingTx) {
    res.status(200).json({
      message: "Idempotency Triggered: This payment webhook transaction was already successfully processed.",
      duplicate: true,
      transaction: existingTx,
    });
    return;
  }

  // --- STEP 2: LOOKUP SYSTEM ORDER ---
  const targetOrder = db.orders.findById(order_id);

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
    db.paymentTransactions.create({
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
    db.orders.updatePaymentStatus(order_id, "failed");
    db.paymentTransactions.create({
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
  db.orders.updatePaymentStatus(order_id, "paid", "new"); // Enqueues order directly into the Active Kitchen Board

  const successTx = db.paymentTransactions.create({
    transaction_key: idemp_key,
    order_id,
    amount: Number(amount) || targetOrder.total_amount,
    status: "success",
  });

  const updatedOrder = db.orders.findById(order_id);

  res.status(200).json({
    message: "Webhook processed successfully. Transaction registered, kitchen staff alerted in real-time.",
    receipt: {
      fiscal_signature: `fisc_sig_${Math.random().toString(36).substr(2, 10).toUpperCase()}`,
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
export function crmGetOrders(req: SecureRequest, res: Response) {
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Unauthorized credentials." });
    return;
  }

  // CRM staff only fetches paid order tracks belonging specifically to context restaurant_id
  const orders = db.orders.findByRestaurant(restaurant_id, { paymentStatus: "paid" });

  // Materialize item rows to give chef instant recipe instructions
  const ordersWithItems = orders.map((order) => ({
    ...order,
    items: db.orderItems.findByOrder(order.id),
  }));

  res.json({
    restaurant_id,
    count: ordersWithItems.length,
    orders: ordersWithItems,
  });
}

/**
 * 4. CRM Endpoint: Advance Kitchen Order status
 * PATCH /api/v1/crm/orders/:id
 * Needs Bearer JWT
 */
export function crmUpdateOrderStatus(req: SecureRequest, res: Response) {
  const { id } = req.params;
  const { order_status } = req.body;
  const restaurant_id = req.restaurant_id;

  if (!restaurant_id) {
    res.status(400).json({ error: "SaaS context violated: Unauthorized credentials." });
    return;
  }

  const validStatuses: Order["order_status"][] = ["new", "cooking", "ready", "out_for_delivery", "delivered"];
  if (!order_status || !validStatuses.includes(order_status)) {
    res.status(400).json({
      error: `Invalid status argument. Allowed states: [${validStatuses.join(", ")}]`,
    });
    return;
  }

  // Бизнес-правило: статус "курьер в пути" имеет смысл только для заказов с доставкой на дом —
  // для "в заведении"/"самовывоз" заказ идёт прямо из ready в delivered.
  if (order_status === "out_for_delivery") {
    const existingOrder = db.orders.findByIdAndRestaurant(id, restaurant_id);
    if (existingOrder && existingOrder.delivery_type !== "delivery") {
      res.status(400).json({
        error: "Business rule violated: 'out_for_delivery' is only valid for orders with delivery_type = 'delivery'.",
      });
      return;
    }
  }

  // Tenant boundary enforced inside the repository: "...WHERE id = ? AND restaurant_id = ?"
  const updatedOrder = db.orders.updateOrderStatus(id, restaurant_id, order_status);

  if (!updatedOrder) {
    res.status(404).json({
      error: "Cross-Tenant Access Refused: The requested order either is unregistered or resides inside a foreign restaurant.",
    });
    return;
  }

  const items = db.orderItems.findByOrder(id);

  res.json({
    message: `State advanced to: ${order_status}`,
    order: {
      ...updatedOrder,
      items,
    },
  });
}
