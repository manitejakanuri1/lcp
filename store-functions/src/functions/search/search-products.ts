import { toProductSummary, type SummaryRow } from '../../data/products';
import { query } from '../../shared/db';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/** Name / fabric / collection-slug substring search (pg_trgm indexes on name and fabric). */
export const searchProducts = handle('GET', async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 100);
  if (!q) {
    sendJson(res, { results: [] });
    return;
  }

  const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit)) || 10));
  const escaped = q.replace(/[\\%_]/g, '\\$&');
  const { rows } = await query<SummaryRow>(
    `SELECT s.* FROM store.product_summaries s
      WHERE s.name ILIKE $1 OR s.fabric ILIKE $1
         OR EXISTS (SELECT 1 FROM store.product_categories pc JOIN store.categories c ON c.id = pc.category_id
                     WHERE pc.product_id = s.id AND c.slug ILIKE $1)
      ORDER BY (s.name ILIKE $2) DESC, s.popularity DESC, s.id LIMIT $3`,
    [`%${escaped}%`, `${escaped}%`, limit],
  );
  sendJson(res, { results: rows.map(toProductSummary) });
}, { cache: { maxAge: 30, sMaxAge: 120 } });
