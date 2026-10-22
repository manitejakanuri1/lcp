import { createHmac, timingSafeEqual } from 'node:crypto';
import { StoreError } from './envelope';

/**
 * Razorpay, over its REST API rather than the npm package: two calls are needed, both plain
 * JSON over HTTPS, and a dependency that ships its own HTTP client is a bigger thing to keep
 * current than fifteen lines.
 *
 * The key id is public - it is handed to the browser to open the payment window. The secret
 * never leaves this service: it signs nothing on the client and appears in no response.
 */

const keyId = () => process.env.RAZORPAY_KEY_ID ?? '';
const keySecret = () => process.env.RAZORPAY_KEY_SECRET ?? '';

export const razorpayConfigured = () => Boolean(keyId() && keySecret());
export const publicKeyId = () => keyId();

/** Rupees to paise. Razorpay counts in paise, and a rupee amount sent as paise is a 100x error. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>): Promise<RazorpayOrder> {
  if (!razorpayConfigured()) throw new StoreError('AUTH_NOT_CONFIGURED', 'Online payment is not set up yet.');
  if (amountPaise < 100) throw new StoreError('VALIDATION_ERROR', 'The smallest payment is one rupee.');

  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes, payment_capture: 1 }),
  });

  const body = (await response.json().catch(() => null)) as { error?: { description?: string } } & RazorpayOrder;
  if (!response.ok) {
    // 401 means the keys are wrong, which is ours to fix, not the shopper's: either way the
    // shopper is told the payment could not be started, and the reason is logged.
    console.error('Razorpay order failed:', response.status, body?.error?.description ?? body);
    throw new StoreError('INTERNAL_ERROR', 'Could not start the payment. Please try again.');
  }
  return body;
}

/**
 * The signature Razorpay returns to the browser is HMAC-SHA256 of "<order id>|<payment id>"
 * with the secret. It is the only proof that the payment really happened: everything else in
 * that callback comes from the shopper's own browser and can be typed by anyone.
 */
export function signatureIsValid(razorpayOrderId: string, razorpayPaymentId: string, signature: string): boolean {
  if (!razorpayConfigured() || !signature) return false;
  const expected = createHmac('sha256', keySecret()).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  // Compared byte by byte in constant time; a plain === leaks how much of a forged signature
  // was right, one character at a time.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** What the payment was made with, for the shop's own records. Never trusted for the amount. */
export async function fetchPayment(paymentId: string): Promise<{ method?: string; amount?: number; status?: string } | null> {
  if (!razorpayConfigured()) return null;
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString('base64');
  try {
    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as { method?: string; amount?: number; status?: string };
  } catch {
    return null;
  }
}
