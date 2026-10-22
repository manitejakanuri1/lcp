import { createHash } from 'node:crypto';
import { createCustomer, logAuthEvent, startSession, withinRateLimit } from '../../data/customers';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { issueAccessToken } from '../../shared/session';
import { optString, reqString } from '../../shared/validate';

const WINDOW_SECONDS = 60 * 60;
const PER_IP_LIMIT = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;
const MIN_PASSWORD = 8;

/**
 * INTERIM sign-up against store.customer_credentials, the twin of auth-login: the identity
 * provider replaces both, and this file goes with it.
 *
 * A new account is signed in straight away, because asking someone to type the same password
 * again on a sign-in screen loses customers at the one moment they are ready to buy. Sign-ups
 * are counted per IP in the database, so a script cannot fill the customer table.
 */
export const authRegister = handle(
  'POST',
  async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = reqString(b.email, 'email').toLowerCase();
    const password = reqString(b.password, 'password');
    const firstName = reqString(b.firstName, 'firstName');
    const lastName = optString(b.lastName, 'lastName')?.trim() ?? '';
    const phone = optString(b.phone, 'phone')?.trim();
    const marketingOptIn = b.marketingOptIn === true;

    if (email.length > 254 || !EMAIL.test(email)) throw new StoreError('INVALID_EMAIL', 'Enter a valid email address.');
    if (password.length < MIN_PASSWORD) {
      throw new StoreError('VALIDATION_ERROR', `Use at least ${MIN_PASSWORD} characters for the password.`);
    }
    if (password.length > 256) throw new StoreError('VALIDATION_ERROR', 'That password is too long.');
    if (firstName.length > 80 || lastName.length > 80) throw new StoreError('VALIDATION_ERROR', 'That name is too long.');
    if (phone && !PHONE.test(phone)) throw new StoreError('INVALID_PHONE', 'Enter a valid phone number.');

    const ipHash = createHash('sha256').update(req.ip ?? 'unknown').digest('hex').slice(0, 32);
    const userAgent = req.get('user-agent') ?? undefined;
    if (!(await withinRateLimit(`register:ip:${ipHash}`, WINDOW_SECONDS, PER_IP_LIMIT))) {
      throw new StoreError('TOO_MANY_REQUESTS', 'Too many sign-ups from here. Try again later.');
    }

    const customer = await createCustomer({ email, password, firstName, lastName, phone, marketingOptIn });
    // Said plainly rather than hidden: the person is standing at their own sign-up form and
    // already knows whether they have an account here.
    if (!customer) throw new StoreError('VALIDATION_ERROR', 'That email already has an account. Sign in instead.');

    const { token, expiresIn, jti } = await issueAccessToken(customer.id);
    await startSession(jti, customer.id, expiresIn, userAgent);
    // auth_events only allows the sign-in names, and a sign-up does sign the customer in.
    await logAuthEvent('login_success', { customerId: customer.id, email, ipHash, userAgent });
    sendJson(res, { accessToken: token, tokenType: 'Bearer', expiresIn, profile: customer.profile }, 201);
  },
  { private: true },
);
