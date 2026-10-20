import { callFunction } from './client';

export function subscribeNewsletter(email: string): Promise<{ success: boolean; email: string }> {
  return callFunction('newsletter-subscribe', { method: 'POST', body: { email } });
}
