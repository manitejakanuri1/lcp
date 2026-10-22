import type { BillCreateResponse, BillItemRow, BillRow } from '../../contracts';
import { PAYMENT_METHODS } from '../../contracts';
import { requireRole } from '../../shared/auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { query, type PgError } from '../../shared/db';
import { optEnum, optNumber, optString, optUuid } from '../../shared/validate';

/** pos.create_bill raises these as the exception message (SQLSTATE P0001). */
const BILL_ERRORS: Record<string, [StoreError['code'], string]> = {
  VALIDATION_ERROR: ['VALIDATION_ERROR', 'items must be a non-empty list of distinct products.'],
  PRODUCT_NOT_FOUND: ['PRODUCT_NOT_FOUND', 'One or more products were not found.'],
  PRODUCT_ALREADY_SOLD: [
    'PRODUCT_ALREADY_SOLD',
    'One or more products were just sold or are held for a web order. Refresh and try again.',
  ],
};

export const billingCreate = handle('POST', async (req, res) => {
  const caller = await requireRole(req, ['founder', 'salesman']);
  const b = (req.body ?? {}) as Record<string, unknown>;

  if (!Array.isArray(b.items) || b.items.length === 0) {
    throw new StoreError('VALIDATION_ERROR', 'items must be a non-empty array.');
  }
  const items = b.items.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const product_id = optUuid(o.product_id, `items[${i}].product_id`);
    if (!product_id) throw new StoreError('VALIDATION_ERROR', `items[${i}].product_id is required.`);
    const selling_price = optNumber(o.selling_price, `items[${i}].selling_price`);
    return selling_price === undefined ? { product_id } : { product_id, selling_price };
  });
  if (new Set(items.map((r) => r.product_id)).size !== items.length) {
    throw new StoreError('VALIDATION_ERROR', 'Each product may appear only once.');
  }

  const customer_name = optString(b.customer_name, 'customer_name') ?? null;
  const customer_phone = optString(b.customer_phone, 'customer_phone') ?? null;
  const notes = optString(b.notes, 'notes') ?? null;
  const payment_method = optEnum(b.payment_method, 'payment_method', PAYMENT_METHODS) ?? 'cash';

  // One transaction inside the database: claims the pieces, numbers the bill, inserts header + items.
  let bill: BillRow;
  try {
    const { rows } = await query<BillRow>('SELECT * FROM pos.create_bill($1, $2, $3, $4, $5, $6::jsonb)', [
      caller.id,
      customer_name,
      customer_phone,
      payment_method,
      notes,
      JSON.stringify(items),
    ]);
    bill = rows[0];
  } catch (err) {
    const known = (err as PgError).code === 'P0001' && BILL_ERRORS[(err as PgError).message];
    if (known) throw new StoreError(known[0], known[1]);
    throw err;
  }

  const { rows: billItems } = await query<BillItemRow>(
    'SELECT * FROM pos.bill_items WHERE bill_id = $1 ORDER BY created_at, id',
    [bill.id],
  );
  sendJson(res, { ...bill, items: billItems } as BillCreateResponse, 201);
});
