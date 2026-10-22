import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * PUBLIC stub. Header icon counts (01-landing-page.md). The storefront header reads counts from its
 * client store, so this is unused; it will be removed or become account-backed with the cart sync.
 */
export const cartWishlistCountGet = handle('GET', async (_req, res) => {
  sendJson(res, { cartCount: 0, wishlistCount: 0 });
});
