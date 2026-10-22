import { randomUUID } from 'node:crypto';
import { attachRazorpayOrder, createPendingOrder, razorpayOrderFor, releaseOrder, type Address } from '../../data/checkout';
import { parseLines } from '../../data/cart';
import { requireCustomer } from '../../shared/customer-auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { createRazorpayOrder, publicKeyId, razorpayConfigured, toPaise } from '../../shared/razorpay';
import { optString, reqString } from '../../shared/validate';

const PINCODE = /^\d{6}$/;
const PHONE = /^[6-9]\d{9}$/;

/**
 * Start a payment: write the order, hold the pieces, open a Razorpay order for exactly what
 * the shop's own catalogue says those pieces cost.
 *
 * The browser sends which sarees, never what they cost. The amount returned here is the amount
 * the payment window will ask for, and both come from the same priced cart.
 */
export const orderCreate = handle(
  'POST',
  async (req, res) => {
    const { customer } = await requireCustomer(req);
    if (!razorpayConfigured()) throw new StoreError('AUTH_NOT_CONFIGURED', 'Online payment is not switched on yet.');

    const b = (req.body ?? {}) as Record<string, unknown>;
    const lines = parseLines(b.lines);
    if (lines.length === 0) throw new StoreError('VALIDATION_ERROR', 'The bag is empty.');

    const a = (b.address ?? {}) as Record<string, unknown>;
    const phone = reqString(a.phone, 'phone').replace(/\D/g, '');
    const pincode = reqString(a.pincode, 'pincode').replace(/\D/g, '');
    if (!PHONE.test(phone)) throw new StoreError('INVALID_PHONE', 'Enter a 10 digit mobile number.');
    if (!PINCODE.test(pincode)) throw new StoreError('INVALID_PINCODE', 'Enter a 6 digit PIN code.');

    const address: Address = {
      firstName: reqString(a.firstName, 'firstName').slice(0, 80),
      lastName: (optString(a.lastName, 'lastName') ?? '').slice(0, 80),
      address: reqString(a.address, 'address').slice(0, 300),
      apartment: (optString(a.apartment, 'apartment') ?? '').slice(0, 120),
      city: reqString(a.city, 'city').slice(0, 80),
      state: reqString(a.state, 'state').slice(0, 80),
      pincode,
      phone,
      whatsappOptIn: a.whatsappOptIn === true,
    };

    // The browser's retry guard: tapping Pay twice must not make two orders, each holding the
    // same pieces. A missing one is generated here, which simply means no retry protection.
    const idempotencyKey = (optString(b.idempotencyKey, 'idempotencyKey') ?? randomUUID()).slice(0, 80);

    const order = await createPendingOrder(customer.id, lines, address, idempotencyKey);

    // The order and its hold are written before Razorpay is asked for anything, so a refusal
    // there - wrong keys, their service down - must give the pieces straight back. Without
    // this the saree sits held for fifteen minutes for a payment that never opened.
    // A retry of the same attempt reuses the payment already opened for it. Opening a second
    // one would leave the first unpaid against the same order.
    const openAlready = await razorpayOrderFor(order.orderId);
    if (openAlready) {
      sendJson(res, {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        amount: toPaise(order.total),
        currency: 'INR',
        razorpayOrderId: openAlready,
        keyId: publicKeyId(),
        customer: { name: `${address.firstName} ${address.lastName}`.trim(), phone: address.phone, email: customer.profile.email },
      }, 200);
      return;
    }

    let razorpay;
    try {
      razorpay = await createRazorpayOrder(toPaise(order.total), order.orderNumber, {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
      });
    } catch (error) {
      await releaseOrder(order.orderId, 'Payment could not be started').catch(() => undefined);
      throw error;
    }
    await attachRazorpayOrder(order.orderId, razorpay.id, order.total);

    sendJson(res, {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      amount: razorpay.amount,
      currency: razorpay.currency,
      razorpayOrderId: razorpay.id,
      keyId: publicKeyId(),
      customer: { name: `${address.firstName} ${address.lastName}`.trim(), phone: address.phone, email: customer.profile.email },
    }, 201);
  },
  { private: true },
);
