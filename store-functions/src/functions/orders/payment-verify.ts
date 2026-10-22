import { findOwnOrder, markOrderPaid, razorpayOrderFor, releaseOrder } from '../../data/checkout';
import { requireCustomer } from '../../shared/customer-auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { fetchPayment, signatureIsValid } from '../../shared/razorpay';
import { optString, reqString } from '../../shared/validate';

/**
 * Confirm a payment.
 *
 * Everything in this request arrives through the shopper's own browser, so the only part that
 * counts is the signature: HMAC-SHA256 of "<razorpay order id>|<payment id>" with the shop's
 * secret, which only Razorpay and this service can produce. Without a matching signature
 * nothing is marked paid and the hold is released; with one, the stock comes down and the sale
 * is written into the shop's books.
 *
 * `failed: true` is the browser reporting that the payment window closed badly. It frees the
 * held pieces immediately rather than making the next shopper wait out the fifteen minutes.
 */
export const paymentVerify = handle(
  'POST',
  async (req, res) => {
    const { customer } = await requireCustomer(req);
    const b = (req.body ?? {}) as Record<string, unknown>;

    const orderId = reqString(b.orderId, 'orderId');
    const order = await findOwnOrder(customer.id, orderId);
    if (!order) throw new StoreError('ORDER_NOT_FOUND', 'That order does not exist.');

    if (b.failed === true) {
      await releaseOrder(orderId, optString(b.reason, 'reason') ?? 'Payment not completed');
      sendJson(res, { paid: false, orderNumber: order.order_number });
      return;
    }

    const razorpayPaymentId = reqString(b.razorpayPaymentId, 'razorpayPaymentId');
    const signature = reqString(b.razorpaySignature, 'razorpaySignature');

    // The Razorpay order id comes from this server's own record, not from the browser. A real
    // signature for someone else's cheap order would otherwise mark this order paid.
    const razorpayOrderId = await razorpayOrderFor(orderId);
    if (!razorpayOrderId) throw new StoreError('VALIDATION_ERROR', 'No payment was started for that order.');
    if (optString(b.razorpayOrderId, 'razorpayOrderId') && b.razorpayOrderId !== razorpayOrderId) {
      await releaseOrder(orderId, 'Payment belonged to a different order');
      console.error('Payment order mismatch', { orderId, sent: b.razorpayOrderId, expected: razorpayOrderId });
      throw new StoreError('VALIDATION_ERROR', 'That payment belongs to a different order.');
    }

    if (!signatureIsValid(razorpayOrderId, razorpayPaymentId, signature)) {
      await releaseOrder(orderId, 'Signature did not match');
      console.error('Payment signature mismatch', { orderId, razorpayOrderId, razorpayPaymentId });
      throw new StoreError('VALIDATION_ERROR', 'That payment could not be verified.');
    }

    // Only for the record - how it was paid. The amount is never read back from here: it is
    // what the shop priced when the order was written.
    const details = await fetchPayment(razorpayPaymentId);

    const result = await markOrderPaid(orderId, {
      razorpayPaymentId,
      razorpayOrderId,
      method: details?.method,
      raw: details ?? undefined,
    });

    sendJson(res, { paid: true, orderNumber: result.orderNumber, alreadyConfirmed: result.alreadyDone });
  },
  { private: true },
);
