import { StoreError } from '../shared/envelope';
import { query, tx } from '../shared/db';
import { buildCartView } from './cart';
import type { CartLineInput, CartView } from '../shared/types';

/**
 * Turning a bag into an order, and an order into a sale.
 *
 * Two rules hold this together. The amount is priced here from the live catalogue, never
 * taken from the browser - a posted total is a posted discount. And the pieces are held the
 * moment the order is written, because the counter till sells from the same stock: without a
 * hold, a saree can be sold twice in the minute a shopper spends inside the payment window.
 */

/** How long the pieces are held while the shopper pays. Long enough for UPI, short enough that
 *  a walked-away basket does not keep a saree off the counter shelf. */
const HOLD_MINUTES = 15;

export interface Address {
  firstName: string;
  lastName: string;
  address: string;
  apartment: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  whatsappOptIn: boolean;
}

export interface PendingOrder {
  orderId: string;
  orderNumber: string;
  total: number;
  view: CartView;
}

/**
 * Writes an order nobody has paid for yet, with its pieces held.
 *
 * `idempotencyKey` is the browser's own retry guard: tapping Pay twice, or a reload mid-flight,
 * returns the same order instead of a second one with a second hold.
 */
export async function createPendingOrder(
  customerId: string,
  lines: CartLineInput[],
  address: Address,
  idempotencyKey: string,
): Promise<PendingOrder> {
  const view = await buildCartView(lines);
  const payable = view.items.filter((item) => item.inStock);
  if (payable.length === 0) throw new StoreError('OUT_OF_STOCK', 'Nothing in the bag is available to buy.');
  if (view.totals.total <= 0) throw new StoreError('VALIDATION_ERROR', 'This bag has nothing to pay for.');

  return tx(async (q) => {
    const existing = await q<{ id: string; order_number: string; total: string }>(
      `SELECT id, order_number, total FROM store.orders WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      return {
        orderId: existing.rows[0].id,
        orderNumber: existing.rows[0].order_number,
        total: Number(existing.rows[0].total),
        view,
      };
    }

    const shipping = {
      name: `${address.firstName} ${address.lastName}`.trim(),
      phone: address.phone,
      line1: address.address,
      line2: address.apartment,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      whatsappOptIn: address.whatsappOptIn,
    };

    const order = (await q<{ id: string; order_number: string }>(
      `INSERT INTO store.orders (customer_id, subtotal, savings, discount_total, shipping_total, total,
                                 shipping_address, idempotency_key)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
       RETURNING id, order_number`,
      [
        customerId,
        view.totals.subtotal,
        view.totals.savings,
        view.totals.discount,
        view.totals.total,
        JSON.stringify(shipping),
        idempotencyKey,
      ],
    )).rows[0];

    for (const item of payable) {
      await q(
        `INSERT INTO store.order_items (order_id, product_id, variant_id, product_name, product_slug, sku,
                                        variant_label, image_url, quantity, list_price, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          order.id, item.productId, item.variantId, item.name, item.slug, item.sku,
          item.variantLabel ?? null, item.image, item.quantity, item.listPrice, item.unitPrice, item.lineTotal,
        ],
      );

      // The hold the counter till reads before it sells the same piece.
      await q(
        `INSERT INTO store.variant_reservations (variant_id, order_id, qty, expires_at)
         VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))`,
        [item.variantId, order.id, item.quantity, HOLD_MINUTES],
      );
    }

    return { orderId: order.id, orderNumber: order.order_number, total: view.totals.total, view };
  });
}

/**
 * Remembers which Razorpay order belongs to this order, so the confirmation can be checked
 * against it. Razorpay's own guidance: verify with the order id held on the server, never the
 * one handed back by the browser. Without this, a valid payment for a cheap order could be
 * replayed against an expensive one - the signature would check out, because it is a real
 * signature, just for a different order.
 */
export async function attachRazorpayOrder(orderId: string, razorpayOrderId: string, amount: number): Promise<void> {
  await query(
    `INSERT INTO store.payments (order_id, provider, provider_ref, amount, status)
     VALUES ($1, 'razorpay', $2, $3, 'pending')
     ON CONFLICT (provider, provider_ref) DO NOTHING`,
    [orderId, razorpayOrderId, amount],
  );
}

/** The Razorpay order this order was opened with, as the server recorded it. */
export async function razorpayOrderFor(orderId: string): Promise<string | undefined> {
  const { rows } = await query<{ provider_ref: string }>(
    `SELECT provider_ref FROM store.payments
      WHERE order_id = $1 AND provider = 'razorpay' AND provider_ref IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [orderId],
  );
  return rows[0]?.provider_ref;
}

/** The order as the shopper's own, or nothing: an order id from another customer is not found. */
export async function findOwnOrder(customerId: string, orderId: string) {
  const { rows } = await query<{ id: string; order_number: string; total: string; status: string; payment_status: string }>(
    `SELECT id, order_number, total, status::text, payment_status::text
       FROM store.orders WHERE id = $1 AND customer_id = $2`,
    [orderId, customerId],
  );
  return rows[0];
}

/**
 * Payment confirmed: the order is placed, the pieces leave the shop's stock, and the sale
 * lands in the till's own books so the day's takings and the GST return include it.
 *
 * Written to be safe to run twice. Razorpay calls back from the browser and may be retried,
 * and a second run must not take the stock down twice: the work only happens while the order
 * is still unpaid.
 */
export async function markOrderPaid(
  orderId: string,
  payment: { razorpayPaymentId: string; razorpayOrderId: string; method?: string; raw?: unknown },
): Promise<{ orderNumber: string; alreadyDone: boolean }> {
  return tx(async (q) => {
    const order = (await q<{ id: string; order_number: string; total: string; payment_status: string }>(
      `SELECT id, order_number, total, payment_status::text FROM store.orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    )).rows[0];
    if (!order) throw new StoreError('ORDER_NOT_FOUND', 'That order does not exist.');
    if (order.payment_status === 'captured') {
      return { orderNumber: order.order_number, alreadyDone: true };
    }

    const items = (await q<{ variant_id: string; quantity: number; unit_price: string }>(
      `SELECT variant_id, quantity, unit_price FROM store.order_items WHERE order_id = $1`,
      [orderId],
    )).rows;

    // Each website variant points at one POS piece count: a saree's own colour, or one of its
    // colour rows. That is the count the counter till also sells from.
    const billLines: { productId: string; colorId: string | null; quantity: number; price: number; cost: number }[] = [];

    for (const item of items) {
      const source = (await q<{ product_id: string; color_id: string | null }>(
        `SELECT product_id, color_id FROM store.variant_stock_source WHERE variant_id = $1`,
        [item.variant_id],
      )).rows[0];
      if (!source) continue; // a listing no longer linked to shop stock: the order still stands

      const product = (await q<{ id: string; quantity: number; cost_price: string | null }>(
        `SELECT id, quantity, cost_price FROM pos.products WHERE id = $1 FOR UPDATE`,
        [source.product_id],
      )).rows[0];
      if (!product) continue;

      if (source.color_id) {
        await q(
          `UPDATE pos.product_colors
              SET pieces = GREATEST(0, pieces - $2),
                  status = CASE WHEN pieces - $2 <= 0 THEN 'sold' ELSE 'available' END,
                  updated_at = NOW()
            WHERE id = $1`,
          [source.color_id, item.quantity],
        );
      }
      await q(
        `UPDATE pos.products
            SET quantity = GREATEST(0, quantity - $2),
                status = CASE WHEN quantity - $2 <= 0 THEN 'sold' ELSE 'available' END,
                updated_at = NOW()
          WHERE id = $1`,
        [product.id, item.quantity],
      );

      billLines.push({
        productId: product.id,
        colorId: source.color_id,
        quantity: item.quantity,
        price: Number(item.unit_price),
        cost: Number(product.cost_price ?? 0),
      });
    }

    // The hold has done its job; the pieces are gone from stock now.
    await q(`DELETE FROM store.variant_reservations WHERE order_id = $1`, [orderId]);

    await q(
      `UPDATE store.orders
          SET status = 'placed', payment_status = 'captured', placed_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [orderId],
    );
    await q(
      `INSERT INTO store.payments (order_id, provider, provider_ref, method, amount, status, raw)
       VALUES ($1, 'razorpay', $2, $3, $4, 'captured', $5)
       ON CONFLICT (provider, provider_ref) DO NOTHING`,
      [orderId, payment.razorpayPaymentId, payment.method ?? null, order.total, JSON.stringify(payment.raw ?? {})],
    );
    await q(
      `INSERT INTO store.order_status_history (order_id, status, note)
       VALUES ($1, 'placed', $2)`,
      [orderId, `Paid online · ${payment.razorpayPaymentId}`],
    ).catch(() => undefined); // history is a nicety; a missing column must not undo a paid order

    // The shop's own books. A website sale shows in Sales and in the GST report exactly like a
    // counter sale, which is what makes the day's figures add up.
    if (billLines.length > 0) {
      const billNumber = `W-${order.order_number}`;
      const total = billLines.reduce((sum, line) => sum + line.price * line.quantity, 0);
      const cost = billLines.reduce((sum, line) => sum + line.cost * line.quantity, 0);
      const bill = (await q<{ id: string }>(
        `INSERT INTO pos.bills (bill_number, total_amount, total_cost, payment_method, customer_name, customer_phone)
         VALUES ($1, $2, $3, 'online',
                 (SELECT shipping_address->>'name' FROM store.orders WHERE id = $4),
                 (SELECT shipping_address->>'phone' FROM store.orders WHERE id = $4))
         ON CONFLICT (bill_number) DO NOTHING
         RETURNING id`,
        [billNumber, total, cost, orderId],
      )).rows[0];

      if (bill) {
        for (const line of billLines) {
          await q(
            `INSERT INTO pos.bill_items (bill_id, product_id, color_id, quantity, selling_price, cost_price)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [bill.id, line.productId, line.colorId, line.quantity, line.price, line.cost],
          );
        }
      }
    }

    return { orderNumber: order.order_number, alreadyDone: false };
  });
}

/** A payment that failed or was abandoned: the hold goes, the order stays for the record. */
export async function releaseOrder(orderId: string, reason: string): Promise<void> {
  await tx(async (q) => {
    await q(`DELETE FROM store.variant_reservations WHERE order_id = $1`, [orderId]);
    await q(
      `UPDATE store.orders SET payment_status = 'failed', updated_at = NOW()
        WHERE id = $1 AND payment_status = 'pending'`,
      [orderId],
    );
    await q(
      `INSERT INTO store.payments (order_id, provider, method, amount, status, failure_reason)
       SELECT id, 'razorpay', NULL, total, 'failed', $2 FROM store.orders WHERE id = $1`,
      [orderId, reason.slice(0, 300)],
    ).catch(() => undefined);
  });
}
