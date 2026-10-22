import { summariesByRefs, toProductSummary, type SummaryRow } from '../../data/products';
import { query } from '../../shared/db';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * Batched product summaries for homepage product-carousel blocks. Accepts either
 * ?collection=<category-slug> (used by the SDUI product-carousel block, in the collection's own order)
 * or ?ids=ref1,ref2 for an explicit list (each ref a product uuid or slug).
 */
export const catalogProductSummariesGet = handle('GET', async (req, res) => {
  const collection = req.query.collection ? String(req.query.collection) : undefined;
  const idsParam = req.query.ids ? String(req.query.ids) : undefined;
  const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit)) || 8));

  if (collection) {
    const { rows } = await query<SummaryRow>(
      `SELECT s.* FROM store.product_summaries s
         JOIN store.product_categories pc ON pc.product_id = s.id
         JOIN store.categories c ON c.id = pc.category_id AND c.slug = $1 AND c.status = 'published'
        ORDER BY pc.position, s.published_at DESC NULLS LAST, s.id LIMIT $2`,
      [collection, limit],
    );
    sendJson(res, { products: rows.map(toProductSummary) });
    return;
  }
  if (idsParam) {
    const refs = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
    sendJson(res, { products: await summariesByRefs(refs, limit) });
    return;
  }
  const { rows } = await query<SummaryRow>(
    `SELECT * FROM store.product_summaries ORDER BY published_at DESC NULLS LAST, id LIMIT $1`,
    [limit],
  );
  sendJson(res, { products: rows.map(toProductSummary) });
}, { cache: { maxAge: 30, sMaxAge: 120 } });
