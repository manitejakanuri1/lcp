import type { BillGetResponse, BillItemRow, BillRow } from '../../contracts';
import { requireRole } from '../../shared/auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { query } from '../../shared/db';
import { optString, optUuid } from '../../shared/validate';

export const billingGet = handle('GET', async (req, res) => {
  const caller = await requireRole(req, ['founder', 'salesman']);
  const id = optUuid(req.query.id, 'id');
  const billNumber = optString(req.query.billNumber, 'billNumber');
  if (!id && !billNumber) throw new StoreError('VALIDATION_ERROR', 'Provide id or billNumber.');

  // Salesmen only see their own bills; report others as not found.
  const { rows } = await query<BillRow>(
    `SELECT * FROM pos.bills
      WHERE ${id ? 'id = $1' : 'bill_number = $1'}
        AND ($2::uuid IS NULL OR salesman_id = $2)`,
    [id ?? billNumber, caller.role === 'salesman' ? caller.id : null],
  );
  const bill = rows[0];
  if (!bill) throw new StoreError('BILL_NOT_FOUND', 'Bill not found.');

  const { rows: items } = await query<BillItemRow>(
    'SELECT * FROM pos.bill_items WHERE bill_id = $1 ORDER BY created_at, id',
    [bill.id],
  );
  sendJson(res, { ...bill, items } as BillGetResponse);
});
