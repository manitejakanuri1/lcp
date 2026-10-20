import { callFunction } from './client';
import type { NavPayload } from '../types';

export function getNav(): Promise<NavPayload> {
  // Shared shell data, not homepage-specific — cache aggressively (01-landing-page.md).
  return callFunction<NavPayload>('nav-get', { next: { revalidate: 3600 } });
}
