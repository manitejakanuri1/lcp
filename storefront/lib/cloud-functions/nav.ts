import { callFunction } from './client';
import type { NavPayload } from '../types';

export function getNav(): Promise<NavPayload> {
  // Shared shell data, not homepage-specific, so it was cached for an hour. The shop renames
  // its own shelves and menu links now, and an hour of the old menu reads as a broken save,
  // so this keeps pace with the pages instead (01-landing-page.md).
  return callFunction<NavPayload>('nav-get', { next: { revalidate: 300 } });
}
