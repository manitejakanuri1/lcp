import { callFunction } from './client';
import type { HomepagePayload, Policy } from '../types';

/** SDUI payload for `/`, fetched server-side (never client fetch-then-render) and cached 5 min to spare the function + DB. */
export function getHomepage(): Promise<HomepagePayload> {
  return callFunction<HomepagePayload>('cms-homepage-get', { next: { revalidate: 300 } });
}

/** Policy rich text, fetched at build time and on ISR revalidation. */
export function getPolicy(slug: string): Promise<Policy> {
  return callFunction<Policy>('cms-policy-get', { query: { slug }, next: { revalidate: 3600 } });
}
