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

export function logout(): void {
  clearAccessToken();
}
