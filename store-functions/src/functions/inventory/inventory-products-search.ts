import type { ProductSearchResponse } from '../../contracts';
import { PRODUCT_STATUSES } from '../../contracts';
import { requireRole } from '../../shared/auth';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { query } from '../../shared/db';
import { optEnum, optNumber, optString, pageParams } from '../../shared/validate';

export const inventoryProductsSearch = handle('GET', async (req, res) => {
  const caller = await requireRole(req, ['founder', 'salesman']);
  const q = req.query;
  const { page, pageSize, from } = pageParams(q);

  const status = optEnum(q.status, 'status', PRODUCT_STATUSES);
  const color = optString(q.color, 'color');
  const sareeType = optString(q.sareeType, 'sareeType');
  const minPrice = optNumber(q.minPrice, 'minPrice');
  const maxPrice = optNumber(q.maxPrice, 'maxPrice');
  const text = optString(q.q, 'q')?.trim();

  // Salesmen read the view, which hides vendor_name / cost_price / purchase_date.
  const source = caller.role === 'founder' ? 'pos.products' : 'pos.products_salesman';
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (status) add('status = ?', status);
  if (color) add('color ILIKE ?', color);
  if (sareeType) add('saree_type ILIKE ?', sareeType);
  if (minPrice !== undefined) add('selling_price >= ?', minPrice);
  if (maxPrice !== undefined) add('selling_price <= ?', maxPrice);
  if (text) {
    // Escape LIKE wildcards so the text is matched literally. The four trigram GIN indexes serve this OR.
    params.push(`%${text.replace(/[\\%_]/g, '\\$&')}%`);
    const p = `$${params.length}`;
    where.push(`(sku ILIKE ${p} OR saree_type ILIKE ${p} OR material ILIKE ${p} OR color ILIKE ${p})`);
  }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query<Record<string, unknown> & { total: number }>(
    `SELECT *, COUNT(*) OVER () AS total FROM ${source} ${filter}
      ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, from],
  );
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && from > 0) {
    total = (await query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${source} ${filter}`, params)).rows[0].n;
  }
  const items = rows.map(({ total: _total, ...p }) => p);
  sendJson(res, { items, page, pageSize, total } as ProductSearchResponse);
});
