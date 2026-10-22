import { createHash } from 'node:crypto';
import { authenticate, logAuthEvent, startSession, withinRateLimit } from '../../data/customers';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { issueAccessToken } from '../../shared/session';
import { reqString } from '../../shared/validate';

const WINDOW_SECONDS = 15 * 60;
const PER_EMAIL_LIMIT = 10;
const PER_IP_LIMIT = 40;

/**
 * INTERIM sign-in against store.customer_credentials. Replaced by the identity provider (the IdP issues
 * the token; this function is then deleted). Never reveals whether the email or the password was wrong.
 * Attempts are counted in the database (store.hit_rate_limit), so the limit holds across function instances.
 * Each issued token gets a store.customer_sessions row, which is what makes it revocable.
 */
export const authLogin = handle(
  'POST',
  async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = reqString(b.email, 'email').toLowerCase();
    const password = reqString(b.password, 'password');
    if (email.length > 254 || password.length > 256) throw new StoreError('VALIDATION_ERROR', 'Email or password is too long.');

    const ipHash = createHash('sha256').update(req.ip ?? 'unknown').digest('hex').slice(0, 32);
    const userAgent = req.get('user-agent') ?? undefined;
    const emailOk = await withinRateLimit(`login:email:${email}`, WINDOW_SECONDS, PER_EMAIL_LIMIT);
    const ipOk = await withinRateLimit(`login:ip:${ipHash}`, WINDOW_SECONDS, PER_IP_LIMIT);
    if (!emailOk || !ipOk) {
      await logAuthEvent('login_throttled', { email, ipHash, userAgent });
      throw new StoreError('TOO_MANY_REQUESTS', 'Too many sign-in attempts. Try again in a few minutes.');
    }

    const customer = await authenticate(email, password);
    if (!customer) {
      await logAuthEvent('login_failure', { email, ipHash, userAgent });
      throw new StoreError('INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    if (customer.isBlocked) throw new StoreError('ACCOUNT_BLOCKED', 'This account is not active.');

    const { token, expiresIn, jti } = await issueAccessToken(customer.id);
    await startSession(jti, customer.id, expiresIn, userAgent);
    await logAuthEvent('login_success', { customerId: customer.id, email, ipHash, userAgent });
    sendJson(res, { accessToken: token, tokenType: 'Bearer', expiresIn, profile: customer.profile });
  },
  { private: true },
);
