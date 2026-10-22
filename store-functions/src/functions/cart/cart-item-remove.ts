import { lineIdOf } from '../../data/cart';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * PUBLIC by design. Acknowledges a line removal. Guest carts are held client-side, so there is
 * nothing to delete; account-backed carts are replaced wholesale by cart-wishlist-merge.
 */
export const cartItemRemove = handle('POST', async (req, res) => {
  const { productId, variantId } = req.body ?? {};
  if (typeof productId !== 'string' || !productId) throw new StoreError('VALIDATION_ERROR', 'productId is required.');
  sendJson(res, { success: true, lineId: lineIdOf(productId, typeof variantId === 'string' && variantId ? variantId : 'default') });
});
