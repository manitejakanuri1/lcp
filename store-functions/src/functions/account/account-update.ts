import { updateProfile } from '../../data/customers';
import { requireCustomer } from '../../shared/customer-auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Same pattern as the store.customers.phone CHECK, so the database accepts whatever passes here.
const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;
const MAX = 100;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Update name / display name / phone of the signed-in customer. Required: firstName, lastName, displayName.
 * `email` is accepted for the form's sake but may only be re-sent unchanged: the email is the sign-in
 * identity, so changing it must go through the identity provider's verified flow, never a plain edit
 * (otherwise anyone holding a stolen token could re-point the account at their own mailbox).
 */
export const accountUpdate = handle(
  ['POST', 'PATCH'],
  async (req, res) => {
    const { customer } = await requireCustomer(req);

    const firstName = text(req.body?.firstName);
    const lastName = text(req.body?.lastName);
    const displayName = text(req.body?.displayName);
    const email = text(req.body?.email);
    const phone = text(req.body?.phone);

    if (!firstName || !lastName || !displayName) {
      throw new StoreError('VALIDATION_ERROR', 'First name, last name and display name are required.');
    }
    if ([firstName, lastName, displayName].some((v) => v.length > MAX)) {
      throw new StoreError('VALIDATION_ERROR', `Names must be at most ${MAX} characters.`);
    }
    if (!EMAIL_PATTERN.test(email)) throw new StoreError('INVALID_EMAIL', 'Provide a valid email address.');
    if (email.toLowerCase() !== customer.profile.email.toLowerCase()) {
      throw new StoreError('VALIDATION_ERROR', 'Email changes are not available yet. Contact support to change your email.');
    }
    if (phone && !PHONE_PATTERN.test(phone)) throw new StoreError('INVALID_PHONE', 'Provide a valid phone number.');

    sendJson(res, await updateProfile(customer.id, { firstName, lastName, displayName, phone }));
  },
  { private: true },
);
