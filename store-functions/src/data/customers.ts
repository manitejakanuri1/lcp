import { StoreError } from '../shared/envelope';
import { isUuid, query, tx } from '../shared/db';
import { hashPassword, verifyPassword } from '../shared/password';
import type { AccountProfile, Address } from '../shared/types';

/**
 * Customers live in store.customers / addresses / customer_credentials / customer_sessions.
 * Every per-customer function receives a `CustomerRecord` from `requireCustomer()`, so the owner is always
 * the verified token subject, never a value from the request.
 */
export interface CustomerRecord {
  id: string;
  isBlocked: boolean;
  profile: AccountProfile;
}

interface CustomerRow {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  display_name: string;
  phone: string | null;
  member_tier: string;
  created_at: Date;
  is_blocked: boolean;
}

const CUSTOMER_COLUMNS = `id, email::text AS email, first_name, last_name, display_name, phone, member_tier, created_at, is_blocked`;

const toRecord = (r: CustomerRow): CustomerRecord => ({
  id: r.id,
  isBlocked: r.is_blocked,
  profile: {
    firstName: r.first_name,
    lastName: r.last_name,
    displayName: r.display_name,
    email: r.email ?? '',
    phone: r.phone ?? '',
    memberSince: r.created_at.toISOString(),
    memberTier: r.member_tier,
  },
});

export async function findCustomerById(id: string): Promise<CustomerRecord | undefined> {
  if (!isUuid(id)) return undefined;
  const { rows } = await query<CustomerRow>(`SELECT ${CUSTOMER_COLUMNS} FROM store.customers WHERE id = $1`, [id]);
  return rows[0] && toRecord(rows[0]);
}

export interface ProfileUpdate {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
}

export async function updateProfile(id: string, u: ProfileUpdate): Promise<AccountProfile> {
  const { rows } = await query<CustomerRow>(
    `UPDATE store.customers SET first_name = $2, last_name = $3, display_name = $4, phone = NULLIF($5, '')
      WHERE id = $1 RETURNING ${CUSTOMER_COLUMNS}`,
    [id, u.firstName, u.lastName, u.displayName, u.phone],
  );
  return toRecord(rows[0]).profile;
}

// ---- Authentication (interim email + password; see design_docs/phase2-auth-design.md) ----------------------

// Hash of a random value: verified against for unknown emails so response time does not reveal
// whether an account exists.
let decoyHash: Promise<string> | undefined;
const decoy = () => (decoyHash ??= hashPassword(`decoy-${Math.random()}-${Date.now()}`));

/** Returns the customer on a correct email + password, otherwise null (never says which was wrong). */
export async function authenticate(email: string, password: string): Promise<CustomerRecord | null> {
  const { rows } = await query<CustomerRow & { password_hash: string }>(
    `SELECT c.id, c.email::text AS email, c.first_name, c.last_name, c.display_name, c.phone, c.member_tier,
            c.created_at, c.is_blocked, cc.password_hash
       FROM store.customers c JOIN store.customer_credentials cc ON cc.customer_id = c.id
      WHERE c.email = $1`,
    [email],
  );
  const row = rows[0];
  const ok = await verifyPassword(password, row ? row.password_hash : await decoy());
  return row && ok ? toRecord(row) : null;
}

export interface NewCustomer {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  marketingOptIn: boolean;
}

/**
 * Creates a customer and its interim password row together. Returns null when the email is
 * already registered: the unique index decides that, not a SELECT first, so two sign-ups
 * racing on the same address cannot both get through.
 */
export async function createCustomer(n: NewCustomer): Promise<CustomerRecord | null> {
  const passwordHash = await hashPassword(n.password);
  const display = `${n.firstName} ${n.lastName}`.trim() || n.email.split('@')[0];
  try {
    return await tx(async (q) => {
      const { rows } = await q<CustomerRow>(
        `INSERT INTO store.customers (email, first_name, last_name, display_name, phone, marketing_opt_in)
         VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6)
         RETURNING ${CUSTOMER_COLUMNS}`,
        [n.email, n.firstName, n.lastName, display, n.phone ?? '', n.marketingOptIn],
      );
      await q(`INSERT INTO store.customer_credentials (customer_id, password_hash) VALUES ($1, $2)`, [
        rows[0].id,
        passwordHash,
      ]);
      return toRecord(rows[0]);
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return null; // email already registered
    throw err;
  }
}

/** Records an issued token so it can be revoked (logout) and checked on every request. */
export async function startSession(jti: string, customerId: string, expiresInSeconds: number, userAgent?: string): Promise<void> {
  await query(
    `INSERT INTO store.customer_sessions(jti, customer_id, expires_at, user_agent)
     VALUES ($1, $2, NOW() + make_interval(secs => $3), $4)`,
    [jti, customerId, expiresInSeconds, userAgent?.slice(0, 300) ?? null],
  );
}

/** True while the token's session exists, is not revoked and has not expired. */
export async function sessionIsLive(jti: string, customerId: string): Promise<boolean> {
  if (!isUuid(jti)) return false;
  const { rows } = await query(
    `SELECT 1 FROM store.customer_sessions
      WHERE jti = $1 AND customer_id = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
    [jti, customerId],
  );
  return rows.length > 0;
}

export async function logAuthEvent(
  event: 'login_success' | 'login_failure' | 'login_throttled',
  fields: { customerId?: string; email?: string; ipHash?: string; userAgent?: string },
): Promise<void> {
  await query(
    `INSERT INTO store.auth_events(customer_id, email_tried, event, ip_hash, user_agent) VALUES ($1, $2, $3, $4, $5)`,
    [fields.customerId ?? null, fields.email ?? null, event, fields.ipHash ?? null, fields.userAgent?.slice(0, 300) ?? null],
  );
}

/** Durable fixed-window limiter (store.hit_rate_limit): false once `limit` hits are used in the window. */
export async function withinRateLimit(bucket: string, windowSeconds: number, limit: number): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>('SELECT store.hit_rate_limit($1, $2, $3) AS ok', [bucket, windowSeconds, limit]);
  return rows[0].ok;
}

// ---- Addresses -----------------------------------------------------------------------------------------------

export const MAX_ADDRESSES = 20;

export type AddressFields = Omit<Address, 'id' | 'isDefault'>;

interface AddressRow {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

const ADDRESS_COLUMNS = 'id, label, name, phone, line1, line2, city, state, pincode, is_default';

const toAddress = (r: AddressRow): Address => ({
  id: r.id,
  label: r.label,
  name: r.name,
  phone: r.phone,
  line1: r.line1,
  line2: r.line2,
  city: r.city,
  state: r.state,
  pincode: r.pincode,
  isDefault: r.is_default,
});

/** Default first, then oldest first. */
export async function listAddresses(customerId: string): Promise<Address[]> {
  const { rows } = await query<AddressRow>(
    `SELECT ${ADDRESS_COLUMNS} FROM store.addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at, id`,
    [customerId],
  );
  return rows.map(toAddress);
}

/**
 * Creates (no `id`) or updates one of the caller's addresses. The first address is always the default;
 * making another one default clears the old flag first (a partial unique index allows only one).
 * An id that is not the caller's answers ADDRESS_NOT_FOUND, exactly like one that does not exist.
 */
export function saveAddress(customerId: string, id: string, fields: AddressFields, wantDefault: boolean): Promise<Address> {
  return tx(async (q) => {
    // Serialise this customer's address writes so two concurrent saves cannot both claim "default".
    await q('SELECT id FROM store.customers WHERE id = $1 FOR UPDATE', [customerId]);

    let existing: AddressRow | undefined;
    if (id) {
      if (!isUuid(id)) throw new StoreError('ADDRESS_NOT_FOUND', 'Address not found.');
      existing = (await q<AddressRow>(`SELECT ${ADDRESS_COLUMNS} FROM store.addresses WHERE id = $1 AND customer_id = $2`, [id, customerId])).rows[0];
      if (!existing) throw new StoreError('ADDRESS_NOT_FOUND', 'Address not found.');
    }
    const count = (await q<{ n: number }>('SELECT COUNT(*)::int AS n FROM store.addresses WHERE customer_id = $1', [customerId])).rows[0].n;
    if (!existing && count >= MAX_ADDRESSES) {
      throw new StoreError('VALIDATION_ERROR', `You can save up to ${MAX_ADDRESSES} addresses.`);
    }

    const makeDefault = wantDefault || count === 0 || (existing?.is_default ?? false);
    if (makeDefault) await q('UPDATE store.addresses SET is_default = FALSE WHERE customer_id = $1 AND is_default', [customerId]);

    const values = [fields.label, fields.name, fields.phone, fields.line1, fields.line2, fields.city, fields.state, fields.pincode, makeDefault];
    const saved = existing
      ? await q<AddressRow>(
          `UPDATE store.addresses SET label = $3, name = $4, phone = $5, line1 = $6, line2 = $7, city = $8, state = $9,
                  pincode = $10, is_default = $11
            WHERE id = $1 AND customer_id = $2 RETURNING ${ADDRESS_COLUMNS}`,
          [existing.id, customerId, ...values],
        )
      : await q<AddressRow>(
          `INSERT INTO store.addresses(customer_id, label, name, phone, line1, line2, city, state, pincode, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${ADDRESS_COLUMNS}`,
          [customerId, ...values],
        );
    return toAddress(saved.rows[0]);
  });
}

/** Deletes one of the caller's addresses; if it was the default the oldest remaining one becomes default. */
export function deleteAddress(customerId: string, id: string): Promise<void> {
  return tx(async (q) => {
    if (!isUuid(id)) throw new StoreError('ADDRESS_NOT_FOUND', 'Address not found.');
    await q('SELECT id FROM store.customers WHERE id = $1 FOR UPDATE', [customerId]);
    const removed = await q<{ is_default: boolean }>('DELETE FROM store.addresses WHERE id = $1 AND customer_id = $2 RETURNING is_default', [id, customerId]);
    if (!removed.rows[0]) throw new StoreError('ADDRESS_NOT_FOUND', 'Address not found.');
    if (removed.rows[0].is_default) {
      await q(
        `UPDATE store.addresses SET is_default = TRUE
          WHERE id = (SELECT id FROM store.addresses WHERE customer_id = $1 ORDER BY created_at, id LIMIT 1)`,
        [customerId],
      );
    }
  });
}
