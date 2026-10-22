import { findIssues, parseLines } from '../../data/cart';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * PUBLIC by design (same reasoning as cart-get). Re-checks every line's live price/stock
 * (04-cart-page.md). Drives the stale-item banners and gates "proceed to checkout" in the UI,
 * but it is advisory: checkout (login required) must re-price and reserve stock server-side.
 */
export const cartValidate = handle('POST', async (req, res) => {
  const issues = await findIssues(parseLines(req.body?.lines));
  sendJson(res, { valid: issues.length === 0, issues });
});
