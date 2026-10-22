import type { ProductGetResponse } from '../../contracts';
import { requireRole } from '../../shared/auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { query } from '../../shared/db';
import { optString, optUuid } from '../../shared/validate';

export const inventoryProductGet = handle('GET', async (req, res) => {
  const caller = await requireRole(req, ['founder', 'salesman']);
  const id = optUuid(req.query.id, 'id');
  const sku = optString(req.query.sku, 'sku');
  if (!id && !sku) throw new StoreError('VALIDATION_ERROR', 'Provide id or sku.');

  // Salesmen read the view, which hides vendor_name / cost_price / purchase_date / created_by.
  const source = caller.role === 'founder' ? 'pos.products' : 'pos.products_salesman';
  const { rows } = await query(`SELECT * FROM ${source} WHERE ${id ? 'id' : 'sku'} = $1`, [id ?? sku]);
  if (!rows[0]) throw new StoreError('PRODUCT_NOT_FOUND', 'Product not found.');

  sendJson(res, rows[0] as ProductGetResponse);
});
