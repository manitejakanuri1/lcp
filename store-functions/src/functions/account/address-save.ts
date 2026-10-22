import { saveAddress } from '../../data/customers';
import { requireCustomer } from '../../shared/customer-auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

const PINCODE_PATTERN = /^[1-9]\d{5}$/;
const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;
const MAX_FIELD = 120;
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Create (no `id`) or update (with `id`) one of the caller's addresses. The first address is always
 * the default. Validation mirrors the `store.addresses` CHECK constraints so the database accepts
 * whatever passes here.
 */
export const addressSave = handle(
  'POST',
  async (req, res) => {
    const { customer } = await requireCustomer(req);
    const body = req.body ?? {};
    const fields = {
      label: text(body.label) || 'Home',
      name: text(body.name),
      phone: text(body.phone),
      line1: text(body.line1),
      line2: text(body.line2),
      city: text(body.city),
      state: text(body.state),
      pincode: text(body.pincode),
    };

    if (!fields.name || !fields.phone || !fields.line1 || !fields.city || !fields.state) {
      throw new StoreError('VALIDATION_ERROR', 'Name, phone, address line 1, city and state are required.');
    }
    if (Object.values(fields).some((v) => v.length > MAX_FIELD)) {
      throw new StoreError('VALIDATION_ERROR', `Each field must be at most ${MAX_FIELD} characters.`);
    }
    if (!PHONE_PATTERN.test(fields.phone)) throw new StoreError('INVALID_PHONE', 'Provide a valid phone number.');
    if (!PINCODE_PATTERN.test(fields.pincode)) throw new StoreError('INVALID_PINCODE', 'Provide a valid 6-digit pincode.');

    sendJson(res, await saveAddress(customer.id, text(body.id), fields, body.isDefault === true));
  },
  { private: true },
);
