import { applyPromotion } from '../../data/cart';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * PUBLIC by design. Coupon check against the bag subtotal (04-cart-page.md). A rejected code is a
 * normal 200 `{ valid: false, message }` so the form can show it inline; only malformed input is a 400.
 * Advisory only: `subtotal` comes from the client, so checkout must recompute the discount from the
 * server-priced cart. Needs rate limiting before launch (code guessing), see phase2-auth-design.md.
 */
export const promotionValidate = handle('POST', async (req, res) => {
  const { code, subtotal } = req.body ?? {};
  if (typeof code !== 'string' || code.length > 40 || typeof subtotal !== 'number' || !Number.isFinite(subtotal) || subtotal < 0) {
    throw new StoreError('VALIDATION_ERROR', 'code (string) and subtotal (number) are required.');
  }
  sendJson(res, await applyPromotion(code, subtotal));
});
