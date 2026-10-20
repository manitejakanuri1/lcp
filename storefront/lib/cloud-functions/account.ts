import { callFunction } from './client';
import type { AccountProfile, Address, AddressInput } from '../types';

export type ProfileInput = Pick<AccountProfile, 'firstName' | 'lastName' | 'displayName' | 'email' | 'phone'>;

export function getAccount(): Promise<AccountProfile> {
  return callFunction('account-get', { auth: true });
}

export function updateAccount(input: ProfileInput): Promise<AccountProfile> {
  return callFunction('account-update', { method: 'POST', body: input, auth: true });
}

export async function getAddresses(): Promise<Address[]> {
  const { items } = await callFunction<{ items: Address[] }>('addresses-get', { auth: true });
  return items;
}

export function saveAddress(input: AddressInput): Promise<Address> {
  return callFunction('address-save', { method: 'POST', body: input, auth: true });
}

export function deleteAddress(id: string): Promise<{ success: boolean }> {
  return callFunction('address-delete', { method: 'POST', body: { id }, auth: true });
}
