import { callFunction } from './client';
import type { WishlistItem } from '../types';

/**
 * Resolves saved product ids to live price/stock rows (06-wishlist-page.md). The id
 * list itself lives in the client wishlist store until accounts exist.
 */
export function getWishlist(ids: string[]): Promise<{ items: WishlistItem[] }> {
  return callFunction('wishlist-get', { query: { ids: ids.join(',') }, cache: 'no-store' });
}
