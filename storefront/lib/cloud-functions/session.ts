/**
 * Customer access token from `auth-login` (FUNCTIONS_USAGE.md §2). Held in sessionStorage so it
 * is gone when the tab closes. Moving it to an httpOnly cookie set by a Next.js route handler is
 * the stronger option once the real identity provider replaces the interim login.
 */
const TOKEN_KEY = 'lakshmi.accessToken';
const EXPIRY_KEY = 'lakshmi.accessTokenExpiresAt';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const expiresAt = Number(window.sessionStorage.getItem(EXPIRY_KEY));
    if (expiresAt && Date.now() >= expiresAt) {
      clearAccessToken();
      return null;
    }
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string, expiresInSeconds?: number): void {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
    if (expiresInSeconds) window.sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresInSeconds * 1000));
  } catch {
    /* storage unavailable: the user will simply be asked to sign in again */
  }
}

export function clearAccessToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(EXPIRY_KEY);
  } catch {
    /* ignore */
  }
}
