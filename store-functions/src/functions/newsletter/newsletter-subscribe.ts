import { query } from '../../shared/db';
import { sendError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Idempotent: a repeat sign-up answers the same success, and an address that had unsubscribed is
 * re-subscribed. The response never reveals whether the address was already on the list.
 */
export const newsletterSubscribe = handle('POST', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    sendError(res, 400, 'INVALID_EMAIL', 'Provide a valid email address.');
    return;
  }

  await query(
    `INSERT INTO store.newsletter_subscribers(email, status, source) VALUES ($1, 'subscribed', 'footer')
     ON CONFLICT (email) DO UPDATE SET status = 'subscribed', unsubscribed_at = NULL
     WHERE store.newsletter_subscribers.status = 'unsubscribed'`,
    [email],
  );
  sendJson(res, { success: true, email });
});
