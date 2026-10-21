import { callFunction } from './client';
import { clearAccessToken, setAccessToken } from './session';
import type { AccountProfile } from '../types';

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  profile: AccountProfile;
}

/**
 * Interim customer sign-in. Errors: 401 INVALID_CREDENTIALS, 429 TOO_MANY_REQUESTS,
 * 503 AUTH_NOT_CONFIGURED. Stores the token so later customer-authenticated calls send it.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const result = await callFunction<LoginResult>('auth-login', { method: 'POST', body: { email, password } });
  setAccessToken(result.accessToken, result.expiresIn);
  return result;
}

export interface Registration {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  marketingOptIn?: boolean;
}

/**
 * Interim customer sign-up. Errors: 400 VALIDATION_ERROR (email already registered, password
 * too short), 400 INVALID_EMAIL / INVALID_PHONE, 429 TOO_MANY_REQUESTS. A new account is
 * signed in straight away, so the token is stored exactly as a login stores it.
 */
export async function register(details: Registration): Promise<LoginResult> {
  const result = await callFunction<LoginResult>('auth-register', { method: 'POST', body: details });
  setAccessToken(result.accessToken, result.expiresIn);
  return result;
}

export function logout(): void {
  clearAccessToken();
}
