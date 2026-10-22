import type { BillListResponse, BillRow } from '../../contracts';
import { requireRole } from '../../shared/auth';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { query } from '../../shared/db';
import { optDate, optUuid, pageParams } from '../../shared/validate';

// Range predicates on created_at (not created_at::date) so idx_pos_bills_* can be used. Days are IST.
const FILTER = `($1::uuid IS NULL OR b.salesman_id = $1)
        AND ($2::date IS NULL OR b.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata'))
        AND ($3::date IS NULL OR b.created_at <  (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))`;

export const billingList = handle('GET', async (req, res) => {
  const caller = await requireRole(req, ['founder', 'salesman']);
  const { page, pageSize, from } = pageParams(req.query);
  const fromDate = optDate(req.query.from, 'from') ?? null;
  const toDate = optDate(req.query.to, 'to') ?? null;
  const salesmanId = optUuid(req.query.salesmanId, 'salesmanId');
  const salesman = caller.role === 'salesman' ? caller.id : salesmanId ?? null;
  const filterParams = [salesman, fromDate, toDate];

  const { rows } = await query<BillRow & { total: number }>(
    `SELECT b.*, COUNT(*) OVER () AS total FROM pos.bills b
      WHERE ${FILTER}
      ORDER BY b.created_at DESC LIMIT $4 OFFSET $5`,
    [...filterParams, pageSize, from],
  );

  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && from > 0) {
    // Page past the end: the window count went with the rows, so count separately.
    total = (await query<{ n: number }>(`SELECT COUNT(*) AS n FROM pos.bills b WHERE ${FILTER}`, filterParams)).rows[0].n;
  }
  const items = rows.map(({ total: _total, ...bill }) => bill as BillRow);
  sendJson(res, { items, page, pageSize, total } as BillListResponse);
});
