import { callFunction } from './client';
import type { ProductSummary } from '../types';

/** Header search — client-time, debounced (01-landing-page.md). */
export function searchProducts(query: string): Promise<{ results: ProductSummary[] }> {
  return callFunction('search-products', { query: { q: query }, cache: 'no-store' });
}
