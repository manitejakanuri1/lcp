import { buildCartView, parseLines } from '../../data/cart';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * PUBLIC by design. Cart contents resolved against the LIVE catalog, with computed totals
 * (04-cart-page.md). Guests have no account, and this only prices the lines the caller sends: it
 * returns catalog data that is already public and nothing personal. Prices in the response always
 * come from the catalog, never from the request.
 */
export const cartGet = handle('POST', async (req, res) => {
  const coupon = typeof req.body?.coupon === 'string' ? req.body.coupon.slice(0, 40) : undefined;
  sendJson(res, await buildCartView(parseLines(req.body?.lines), coupon));
});
