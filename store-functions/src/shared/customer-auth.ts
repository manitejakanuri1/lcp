import type { Request } from 'express';
import { StoreError } from './envelope';
import { verifyAccessToken } from './session';
import { findCustomerById, sessionIsLive, type CustomerRecord } from '../data/customers';

export interface CustomerCaller {
  customer: CustomerRecord;
  jti: string;
}

/**
 * Guard for every per-customer function (account, addresses, orders, account-backed cart).
 * Returns the verified caller; handlers MUST scope all data by `customer.id` and never read an
 * owner id from the request body/query.
 * A token is honoured only while its row in store.customer_sessions is live (not revoked or expired).
 */
export async function requireCustomer(req: Request): Promise<CustomerCaller> {
  const header = req.get('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token) throw new StoreError('UNAUTHENTICATED', 'Sign in to continue.');

  const claims = await verifyAccessToken(token);
  const customer = await findCustomerById(claims.customerId);
  // Same message as a bad token: do not reveal whether the id ever existed.
  if (!customer || !(await sessionIsLive(claims.jti, claims.customerId))) {
    throw new StoreError('UNAUTHENTICATED', 'Invalid or expired session.');
  }
  if (customer.isBlocked) throw new StoreError('ACCOUNT_BLOCKED', 'This account is not active.');
  return { customer, jti: claims.jti };
}
