import type { ProductUpdate, ProductUpdateResponse } from '../../contracts';
import { PRODUCT_STATUSES } from '../../contracts';
import { requireRole } from '../../shared/auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { query, type PgError } from '../../shared/db';
import { isUniqueViolation, optDate, optEnum, optNumber, optString, optUuid } from '../../shared/validate';

export const inventoryProductUpdate = handle('PATCH', async (req, res) => {
  await requireRole(req, ['founder']);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const id = optUuid(b.id, 'id');
  if (!id) throw new StoreError('VALIDATION_ERROR', 'id is required.');

  const patch: Record<string, unknown> = {};
  const put = (k: keyof ProductUpdate, v: unknown) => {
    if (v !== undefined) patch[k] = v;
  };
  for (const k of ['sku', 'vendor_name', 'saree_type', 'material'] as const) {
    if (b[k] !== undefined) {
      const s = optString(b[k], k)?.trim();
      if (!s) throw new StoreError('VALIDATION_ERROR', `${k} must not be empty.`);
      patch[k] = s;
    }
  }
  put('purchase_date', optDate(b.purchase_date, 'purchase_date'));
  put('cost_price', optNumber(b.cost_price, 'cost_price'));
  put('selling_price', optNumber(b.selling_price, 'selling_price'));
  put('status', optEnum(b.status, 'status', PRODUCT_STATUSES));
  for (const k of ['color', 'rack_location', 'image_url'] as const) {
    if (b[k] === null || b[k] === '') patch[k] = null; // explicit null clears the field
    else put(k, optString(b[k], k));
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new StoreError('VALIDATION_ERROR', 'No fields to update.');

  // Column names come from the fixed whitelist above, never from the request.
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  try {
    const { rows } = await query(`UPDATE pos.products SET ${sets} WHERE id = $1 RETURNING *`, [
      id,
      ...keys.map((k) => patch[k]),
    ]);
    if (!rows[0]) throw new StoreError('PRODUCT_NOT_FOUND', 'Product not found.');
    sendJson(res, rows[0] as ProductUpdateResponse);
  } catch (err) {
    if (isUniqueViolation(err as PgError)) throw new StoreError('DUPLICATE_SKU', 'SKU already exists.');
    throw err;
  }
});
