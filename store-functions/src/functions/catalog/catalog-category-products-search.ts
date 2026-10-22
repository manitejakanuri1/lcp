import { findCategory } from '../../data/categories';
import { toProductSummary, type SummaryRow } from '../../data/products';
import { query } from '../../shared/db';
import { sendError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

type SortKey = 'price-asc' | 'price-desc' | 'newest' | 'popularity';

// Cheapest-active-variant price, exactly what the product card shows.
const EFFECTIVE_PRICE = 'COALESCE(s.discount_price, s.price)';

const ORDER_BY: Record<SortKey, string> = {
  'price-asc': `${EFFECTIVE_PRICE} ASC, s.id`,
  'price-desc': `${EFFECTIVE_PRICE} DESC, s.id`,
  popularity: 's.popularity DESC, s.rating DESC, s.id',
  newest: 's.published_at DESC NULLS LAST, s.id',
};

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const catalogCategoryProductsSearch = handle('GET', async (req, res) => {
  const slug = String(req.query.slug ?? '');
  const category = await findCategory(slug);
  if (!category) {
    sendError(res, 404, 'CATEGORY_NOT_FOUND', `No category found for slug "${slug}".`);
    return;
  }

  const fabric = req.query.fabric ? String(req.query.fabric) : undefined;
  const color = req.query.color ? String(req.query.color) : undefined;
  const minPrice = num(req.query.minPrice);
  const maxPrice = num(req.query.maxPrice);
  const requestedSort = String(req.query.sort ?? 'newest') as SortKey;
  const sort: SortKey = requestedSort in ORDER_BY ? requestedSort : 'newest';
  const page = Math.max(1, Math.floor(num(req.query.page) ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(num(req.query.pageSize) ?? 12)));

  // Facet counts are computed on the category's full product set, before the other filters apply.
  const [fabrics, colors] = await Promise.all([
    query<{ value: string; count: number }>(
      `SELECT s.fabric AS value, COUNT(*)::int AS count
         FROM store.product_summaries s JOIN store.product_categories pc ON pc.product_id = s.id AND pc.category_id = $1
        GROUP BY s.fabric ORDER BY count DESC, value`,
      [category.dbId],
    ),
    query<{ value: string; count: number }>(
      `SELECT MIN(v.color) AS value, COUNT(DISTINCT v.product_id)::int AS count
         FROM store.product_variants v
         JOIN store.product_categories pc ON pc.product_id = v.product_id AND pc.category_id = $1
         JOIN store.products p ON p.id = v.product_id AND p.status = 'published'
        WHERE v.is_active AND v.color IS NOT NULL
        GROUP BY lower(v.color) ORDER BY count DESC, value`,
      [category.dbId],
    ),
  ]);

  const where = ['pc.category_id = $1'];
  const params: unknown[] = [category.dbId];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (fabric) add('s.fabric = ?', fabric);
  if (color) {
    add('EXISTS (SELECT 1 FROM store.product_variants v WHERE v.product_id = s.id AND v.is_active AND lower(v.color) = lower(?))', color);
  }
  if (minPrice !== undefined) add(`${EFFECTIVE_PRICE} >= ?`, minPrice);
  if (maxPrice !== undefined) add(`${EFFECTIVE_PRICE} <= ?`, maxPrice);
  const from = `FROM store.product_summaries s JOIN store.product_categories pc ON pc.product_id = s.id WHERE ${where.join(' AND ')}`;

  const { rows } = await query<SummaryRow & { total: number }>(
    `SELECT s.*, COUNT(*) OVER () AS total ${from} ORDER BY ${ORDER_BY[sort]} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page > 1) total = (await query<{ n: number }>(`SELECT COUNT(*) AS n ${from}`, params)).rows[0].n;

  sendJson(res, {
    products: rows.map(toProductSummary),
    facets: { fabric: fabrics.rows, color: colors.rows },
    pagination: { page, pageSize, total },
  });
}, { cache: { maxAge: 30, sMaxAge: 120 } });
