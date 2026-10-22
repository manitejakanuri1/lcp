import { priceLine } from '../../data/cart';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * PUBLIC by design. Validates an add against live price/stock and returns the line to store
 * (04-cart-page.md). Stateless: it is a price/stock check, not a reservation. Two shoppers can
 * still both hold the last piece in their bags; checkout resolves that by reserving stock.
 */
export const cartItemAdd = handle('POST', async (req, res) => {
  const { productId, variantId, quantity } = req.body ?? {};
  const requested = Math.floor(Number(quantity ?? 1));
  if (typeof productId !== 'string' || !productId || !Number.isFinite(requested) || requested < 1) {
    throw new StoreError('VALIDATION_ERROR', 'productId and a positive quantity are required.');
  }

  const result = await priceLine(productId, typeof variantId === 'string' ? variantId : undefined, requested);
  if (!result.ok) throw new StoreError(result.code, result.message);
  sendJson(res, { line: result.line, clamped: result.clamped });
});
