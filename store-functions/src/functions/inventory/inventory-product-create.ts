import type { ProductCreateResponse } from '../../contracts';
import { requireRole } from '../../shared/auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { query, type PgError } from '../../shared/db';
import { isUniqueViolation, optString, reqDate, reqNumber, reqString } from '../../shared/validate';

export const inventoryProductCreate = handle('POST', async (req, res) => {
  const caller = await requireRole(req, ['founder']);
  const b = (req.body ?? {}) as Record<string, unknown>;

  const sku = reqString(b.sku, 'sku');
  const values = [
    sku,
    reqString(b.vendor_name, 'vendor_name'),
    reqDate(b.purchase_date, 'purchase_date'),
    reqNumber(b.cost_price, 'cost_price'),
    reqNumber(b.selling_price, 'selling_price'),
    reqString(b.saree_type, 'saree_type'),
    reqString(b.material, 'material'),
    optString(b.color, 'color') ?? null,
    optString(b.rack_location, 'rack_location') ?? null,
    optString(b.image_url, 'image_url') ?? null,
    caller.id,
  ];

  try {
    const { rows } = await query(
      `INSERT INTO pos.products (sku, vendor_name, purchase_date, cost_price, selling_price, saree_type,
                                 material, color, rack_location, image_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      values,
    );
    sendJson(res, rows[0] as ProductCreateResponse, 201);
  } catch (err) {
    if (isUniqueViolation(err as PgError)) throw new StoreError('DUPLICATE_SKU', `SKU "${sku}" already exists.`);
    throw err;
  }
});
