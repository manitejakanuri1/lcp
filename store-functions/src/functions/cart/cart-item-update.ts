import { priceLine } from '../../data/cart';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/** PUBLIC by design. Sets a line's quantity, capped at live stock; `clamped` tells the client to show why (04-cart-page.md). */
export const cartItemUpdate = handle('POST', async (req, res) => {
  const { productId, variantId, quantity } = req.body ?? {};
  const requested = Math.floor(Number(quantity));
  if (typeof productId !== 'string' || !productId || !Number.isFinite(requested) || requested < 1) {
    throw new StoreError('VALIDATION_ERROR', 'productId and a quantity of at least 1 are required (use cart-item-remove to delete).');
  }

  const result = await priceLine(productId, typeof variantId === 'string' ? variantId : undefined, requested);
  if (!result.ok) throw new StoreError(result.code, result.message);
  sendJson(res, { line: result.line, clamped: result.clamped });
});
