import { findProduct, toProductSummary, type SummaryRow } from '../../data/products';
import { query } from '../../shared/db';
import { sendError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/** Other published products that share a category, most shared categories first, then most popular. */
export const catalogRelatedProductsGet = handle('GET', async (req, res) => {
  const slug = String(req.query.slug ?? '');
  const product = await findProduct(slug);

  if (!product) {
    sendError(res, 404, 'PRODUCT_NOT_FOUND', `No product found for slug "${slug}".`);
    return;
  }

  const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit)) || 8));
  const { rows } = await query<SummaryRow>(
    `SELECT s.* FROM store.product_summaries s
       JOIN (SELECT pc.product_id, COUNT(*) AS shared
               FROM store.product_categories pc
              WHERE pc.category_id IN (SELECT category_id FROM store.product_categories WHERE product_id = $1)
                AND pc.product_id <> $1
              GROUP BY pc.product_id) m ON m.product_id = s.id
      ORDER BY m.shared DESC, s.popularity DESC, s.id LIMIT $2`,
    [product.id, limit],
  );
  sendJson(res, { products: rows.map(toProductSummary) });
}, { cache: { maxAge: 60, sMaxAge: 600 } });
