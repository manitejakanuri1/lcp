import { callFunction } from './client';
import type { CartLineInput } from './cart';

/**
 * Paying for a bag, in two calls.
 *
 * The browser never sends a price. It sends which sarees it wants and where they should go;
 * the server prices them, holds the pieces and opens the payment for that amount. The second
 * call hands back what Razorpay gave the browser, which only counts because of its signature.
 */

export interface CheckoutAddress {
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

export interface StartedPayment {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  razorpayOrderId: string;
  keyId: string;
  customer: { name: string; phone: string; email: string };
}

export function startPayment(
  lines: CartLineInput[],
  address: CheckoutAddress,
  idempotencyKey: string,
): Promise<StartedPayment> {
  return callFunction<StartedPayment>('order-create', {
    method: 'POST',
    body: { lines, address, idempotencyKey },
    auth: true,
    cache: 'no-store',
  });
}

export function confirmPayment(payload: {
  orderId: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  failed?: boolean;
  reason?: string;
}): Promise<{ paid: boolean; orderNumber: string; alreadyConfirmed?: boolean }> {
  return callFunction('payment-verify', { method: 'POST', body: payload, auth: true, cache: 'no-store' });
}
